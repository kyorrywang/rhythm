use futures::stream::FuturesUnordered;
use futures::StreamExt;
use serde_json::{json, Value};
use std::collections::HashMap;

use super::agent_interrupt::wait_for_interrupt;
use super::agent_permissions::ensure_tool_permission;
use super::context::QueryContext;
use crate::infra::event_bus;
use crate::infra::llm::{ChatMessageBlock, LlmToolCall};
use crate::runtime::capabilities::tools::{ToolExecutionContext, ToolResult};
use crate::runtime::conversation::interrupts;
use crate::runtime::policy::hooks::events::HookEvent;
use crate::shared::schema::EventPayload;
use crate::shared::text::truncate_with_suffix;

pub(super) struct ToolExecutionBatch {
    pub(super) tool_call_blocks: Vec<ChatMessageBlock>,
    pub(super) tool_results: Vec<ChatMessageBlock>,
}

pub(super) fn parse_tool_arguments(tool_call: &LlmToolCall) -> Result<Value, String> {
    let raw = tool_call.arguments.trim();
    let normalized = if raw.is_empty() { "{}" } else { raw };
    serde_json::from_str(normalized).map_err(|error| {
        let preview = truncate_with_suffix(normalized, 400, "...");
        format!(
            "Tool '{}' received invalid JSON arguments: {}. Raw arguments: {}",
            tool_call.name, error, preview
        )
    })
}

pub(super) fn tool_call_arguments_for_history(tool_call: &LlmToolCall) -> Value {
    match parse_tool_arguments(tool_call) {
        Ok(args) => args,
        Err(_) if tool_call.arguments.trim().is_empty() => json!({}),
        Err(_) => json!({ "_raw": tool_call.arguments }),
    }
}

pub(super) async fn execute_tools(
    context: &QueryContext,
    tool_calls: Vec<LlmToolCall>,
) -> ToolExecutionBatch {
    let tool_call_blocks: Vec<ChatMessageBlock> = tool_calls
        .iter()
        .map(|tc| ChatMessageBlock::ToolCall {
            id: tc.id.clone(),
            name: tc.name.clone(),
            arguments: tool_call_arguments_for_history(tc),
        })
        .collect();

    let mut tool_results = Vec::new();
    let mut index = 0usize;

    while index < tool_calls.len() {
        if interrupts::is_interrupted(&context.session_id).await {
            break;
        }

        if tool_calls[index].name == "spawn_subagent" {
            let batch_start = index;
            while index < tool_calls.len() && tool_calls[index].name == "spawn_subagent" {
                index += 1;
            }

            let batch_results =
                execute_spawn_subagent_batch(context, &tool_calls[batch_start..index]).await;
            tool_results.extend(batch_results);
        } else {
            let tool_call = &tool_calls[index];
            let args = match parse_tool_arguments(tool_call) {
                Ok(args) => args,
                Err(error) => {
                    let history_args = tool_call_arguments_for_history(tool_call);
                    event_bus::emit(
                        &context.agent_id,
                        &context.session_id,
                        EventPayload::ToolStart {
                            tool_id: tool_call.id.clone(),
                            tool_name: tool_call.name.clone(),
                            args: history_args,
                        },
                    );
                    event_bus::emit(
                        &context.agent_id,
                        &context.session_id,
                        EventPayload::ToolResult {
                            tool_id: tool_call.id.clone(),
                            result: error.clone(),
                            is_error: true,
                        },
                    );
                    event_bus::emit(
                        &context.agent_id,
                        &context.session_id,
                        EventPayload::ToolEnd {
                            tool_id: tool_call.id.clone(),
                            exit_code: 1,
                        },
                    );
                    tool_results.push(ChatMessageBlock::ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: error,
                        is_error: true,
                    });
                    index += 1;
                    continue;
                }
            };

            event_bus::emit(
                &context.agent_id,
                &context.session_id,
                EventPayload::ToolStart {
                    tool_id: tool_call.id.clone(),
                    tool_name: tool_call.name.clone(),
                    args: args.clone(),
                },
            );

            let result_block = execute_single_tool(context, tool_call, args).await;
            if let ChatMessageBlock::ToolResult {
                content, is_error, ..
            } = &result_block
            {
                event_bus::emit(
                    &context.agent_id,
                    &context.session_id,
                    EventPayload::ToolResult {
                        tool_id: tool_call.id.clone(),
                        result: content.clone(),
                        is_error: *is_error,
                    },
                );
            }
            let is_error =
                matches!(&result_block, ChatMessageBlock::ToolResult { is_error, .. } if *is_error);

            event_bus::emit(
                &context.agent_id,
                &context.session_id,
                EventPayload::ToolEnd {
                    tool_id: tool_call.id.clone(),
                    exit_code: if is_error { 1 } else { 0 },
                },
            );

            tool_results.push(result_block);
            index += 1;
        }

        if interrupts::is_interrupted(&context.session_id).await {
            break;
        }
    }

    ToolExecutionBatch {
        tool_call_blocks,
        tool_results,
    }
}

async fn execute_spawn_subagent_batch(
    context: &QueryContext,
    tool_calls: &[LlmToolCall],
) -> Vec<ChatMessageBlock> {
    let mut pending = FuturesUnordered::new();
    let mut ordered_results: Vec<Option<ChatMessageBlock>> = vec![None; tool_calls.len()];

    for (index, tool_call) in tool_calls.iter().cloned().enumerate() {
        let args = match parse_tool_arguments(&tool_call) {
            Ok(args) => args,
            Err(error) => {
                let history_args = tool_call_arguments_for_history(&tool_call);
                event_bus::emit(
                    &context.agent_id,
                    &context.session_id,
                    EventPayload::ToolStart {
                        tool_id: tool_call.id.clone(),
                        tool_name: tool_call.name.clone(),
                        args: history_args,
                    },
                );
                event_bus::emit(
                    &context.agent_id,
                    &context.session_id,
                    EventPayload::ToolResult {
                        tool_id: tool_call.id.clone(),
                        result: error.clone(),
                        is_error: true,
                    },
                );
                event_bus::emit(
                    &context.agent_id,
                    &context.session_id,
                    EventPayload::ToolEnd {
                        tool_id: tool_call.id.clone(),
                        exit_code: 1,
                    },
                );
                ordered_results[index] = Some(ChatMessageBlock::ToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: error,
                    is_error: true,
                });
                continue;
            }
        };

        event_bus::emit(
            &context.agent_id,
            &context.session_id,
            EventPayload::ToolStart {
                tool_id: tool_call.id.clone(),
                tool_name: tool_call.name.clone(),
                args: args.clone(),
            },
        );

        pending.push(async move {
            let result_block = execute_single_tool(context, &tool_call, args).await;
            (index, tool_call, result_block)
        });
    }

    while let Some((index, tool_call, result_block)) = pending.next().await {
        if let ChatMessageBlock::ToolResult {
            content, is_error, ..
        } = &result_block
        {
            event_bus::emit(
                &context.agent_id,
                &context.session_id,
                EventPayload::ToolResult {
                    tool_id: tool_call.id.clone(),
                    result: content.clone(),
                    is_error: *is_error,
                },
            );
        }
        let is_error =
            matches!(&result_block, ChatMessageBlock::ToolResult { is_error, .. } if *is_error);

        event_bus::emit(
            &context.agent_id,
            &context.session_id,
            EventPayload::ToolEnd {
                tool_id: tool_call.id.clone(),
                exit_code: if is_error { 1 } else { 0 },
            },
        );

        ordered_results[index] = Some(result_block);
    }

    ordered_results.into_iter().flatten().collect()
}

async fn execute_single_tool(
    context: &QueryContext,
    tool_call: &LlmToolCall,
    args: Value,
) -> ChatMessageBlock {
    let tool_name = &tool_call.name;
    let tool_id = &tool_call.id;

    // ── PRE_TOOL_USE hook ────────────────────────────────────────────────────
    if let Some(hook_exec) = &context.hook_executor {
        let payload = serde_json::json!({
            "tool_name": tool_name,
            "tool_input": args,
            "event": "pre_tool_use",
        });
        let hook_result = hook_exec.execute(HookEvent::PreToolUse, &payload).await;
        if hook_result.blocked() {
            return ChatMessageBlock::ToolResult {
                tool_call_id: tool_id.clone(),
                content: format!("Blocked by pre_tool_use hook: {}", hook_result.reason()),
                is_error: true,
            };
        }
    }

    // ── Find tool ────────────────────────────────────────────────────────────
    let tool = match context.tool_registry.get(tool_name) {
        Some(t) => t,
        None => {
            return ChatMessageBlock::ToolResult {
                tool_call_id: tool_id.clone(),
                content: format!("Tool '{}' not found", tool_name),
                is_error: true,
            };
        }
    };

    if let Some(denial) =
        ensure_tool_permission(context, tool_name, tool_id, &args, tool.is_read_only()).await
    {
        return denial;
    }

    // ── Execute ──────────────────────────────────────────────────────────────
    let tool_ctx = ToolExecutionContext {
        cwd: context.cwd.clone(),
        agent_id: context.agent_id.clone(),
        session_id: context.session_id.clone(),
        tool_call_id: tool_id.clone(),
        metadata: HashMap::from([
            (
                "provider_id".to_string(),
                Value::String(context.provider_id.clone()),
            ),
            ("model".to_string(), Value::String(context.model.clone())),
            (
                "reasoning".to_string(),
                context
                    .reasoning
                    .clone()
                    .map(Value::String)
                    .unwrap_or(Value::Null),
            ),
            (
                "agent_id".to_string(),
                Value::String(context.definition_id.clone()),
            ),
        ]),
    };

    let result: ToolResult = tokio::select! {
        result = tool.execute(args.clone(), &tool_ctx) => result,
        _ = wait_for_interrupt(&context.session_id) => ToolResult::error(format!("Tool '{}' interrupted", tool_name)),
    };
    let output = result.output;
    let is_error = result.is_error;

    // ── POST_TOOL_USE hook ───────────────────────────────────────────────────
    if let Some(hook_exec) = &context.hook_executor {
        let payload = serde_json::json!({
            "tool_name": tool_name,
            "tool_input": args,
            "tool_output": output,
            "tool_is_error": is_error,
            "event": "post_tool_use",
        });
        let _ = hook_exec.execute(HookEvent::PostToolUse, &payload).await;
    }

    ChatMessageBlock::ToolResult {
        tool_call_id: tool_id.clone(),
        content: output,
        is_error,
    }
}
