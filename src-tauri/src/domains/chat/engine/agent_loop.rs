use futures::stream::FuturesUnordered;
use futures::StreamExt;
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::oneshot;
use tokio::time::{sleep, Duration};

use super::context::QueryContext;
use super::stream_events::UsageTracker;
use crate::domains::agents;
use crate::domains::chat::hooks::events::HookEvent;
use crate::domains::chat::interrupts;
use crate::domains::permissions::runtime as permissions;
use crate::domains::tools::context::resolve_permission_path;
use crate::domains::tools::{ToolExecutionContext, ToolResult};
use crate::platform::event_bus;
use crate::platform::llm::{
    ChatMessage, ChatMessageBlock, LlmResponse, LlmToolCall, LlmToolDefinition,
};
use crate::shared::error::RhythmError;
use crate::shared::schema::EventPayload;
use crate::shared::text::truncate_with_suffix;

/// Drives the tool-calling loop for one query (user message).
///
/// Returns the collected assistant text across all turns, or an error.
pub async fn run_query(
    context: &QueryContext,
    messages: &mut Vec<ChatMessage>,
    usage: &mut UsageTracker,
) -> Result<String, RhythmError> {
    let mut assistant_text = String::new();

    // ── SESSION_START hook ───────────────────────────────────────────────────
    if let Some(hook_exec) = &context.hook_executor {
        let payload = serde_json::json!({
            "agent_id": context.agent_id,
            "session_id": context.session_id,
            "event": "session_start",
        });
        let hook_result = hook_exec.execute(HookEvent::SessionStart, &payload).await;
        if hook_result.blocked() {
            eprintln!("[hooks] SessionStart blocked: {}", hook_result.reason());
            return Err(RhythmError::HookError(format!(
                "SessionStart hook blocked: {}",
                hook_result.reason()
            )));
        }
    }

    let result = run_query_inner(context, messages, &mut assistant_text, usage).await;

    // ── SESSION_END hook ─────────────────────────────────────────────────────
    if let Some(hook_exec) = &context.hook_executor {
        let payload = serde_json::json!({
            "agent_id": context.agent_id,
            "session_id": context.session_id,
            "event": "session_end",
        });
        let _ = hook_exec.execute(HookEvent::SessionEnd, &payload).await;
    }

    result
}

async fn run_query_inner(
    context: &QueryContext,
    messages: &mut Vec<ChatMessage>,
    assistant_text: &mut String,
    usage: &mut UsageTracker,
) -> Result<String, RhythmError> {
    // Build tool schema list once
    let tool_defs: Vec<LlmToolDefinition> = context
        .tool_registry
        .to_api_schema()
        .into_iter()
        .map(|d| LlmToolDefinition {
            name: d.name,
            description: d.description,
            parameters: d.parameters,
        })
        .collect();

    let mut turn = 0usize;
    let mut used_subagent_tool = false;
    let mut executed_any_tools = false;
    loop {
        if let Some(limit) = context.agent_turn_limit {
            if turn >= limit {
                event_bus::emit(
                    &context.agent_id,
                    &context.session_id,
                    EventPayload::TextDelta {
                        content: format!("\n[Agent turn limit ({limit}) exceeded]"),
                    },
                );
                return Err(RhythmError::AgentTurnLimitExceeded(limit));
            }
        }
        turn += 1;
        let input_chars = messages
            .iter()
            .map(|m| {
                m.blocks
                    .iter()
                    .map(|b| match b {
                        ChatMessageBlock::Text { text } => text.len(),
                        ChatMessageBlock::File { text, .. } => {
                            text.as_deref().map(str::len).unwrap_or(0)
                        }
                        ChatMessageBlock::ToolResult { content, .. } => content.len(),
                        _ => 0,
                    })
                    .sum::<usize>()
            })
            .sum::<usize>();
        let mut output_chars_this_turn = 0usize;

        let mut thinking_ended = false;
        let mut pending_tool_calls = Vec::new();
        let mut ended_with_done = false;
        let mut continue_after_tools = false;

        let mut stream = context
            .api_client
            .chat_stream(messages.clone(), tool_defs.clone())
            .await
            .map_err(RhythmError::LlmError)?;

        while let Some(res) = stream.next().await {
            if interrupts::is_interrupted(&context.session_id).await {
                interrupts::clear_interrupt(&context.session_id).await;
                event_bus::emit(
                    &context.agent_id,
                    &context.session_id,
                    EventPayload::Interrupted,
                );
                return Ok(assistant_text.clone());
            }

            match res {
                Ok(LlmResponse::ThinkingDelta(delta)) => {
                    event_bus::emit(
                        &context.agent_id,
                        &context.session_id,
                        EventPayload::ThinkingDelta {
                            content: delta.clone(),
                        },
                    );
                }
                Ok(LlmResponse::TextDelta(delta)) => {
                    if !thinking_ended {
                        event_bus::emit(
                            &context.agent_id,
                            &context.session_id,
                            EventPayload::ThinkingEnd,
                        );
                        thinking_ended = true;
                    }
                    event_bus::emit(
                        &context.agent_id,
                        &context.session_id,
                        EventPayload::TextDelta {
                            content: delta.clone(),
                        },
                    );
                    assistant_text.push_str(&delta);
                    output_chars_this_turn += delta.len();
                }
                Ok(LlmResponse::ThinkingEnd) => {
                    event_bus::emit(
                        &context.agent_id,
                        &context.session_id,
                        EventPayload::ThinkingEnd,
                    );
                    thinking_ended = true;
                }
                Ok(LlmResponse::ToolCall(tool_call)) => {
                    if !thinking_ended {
                        event_bus::emit(
                            &context.agent_id,
                            &context.session_id,
                            EventPayload::ThinkingEnd,
                        );
                        thinking_ended = true;
                    }
                    pending_tool_calls.push(tool_call);
                }
                Ok(LlmResponse::ToolCallDelta(tool_call)) => {
                    if !thinking_ended {
                        event_bus::emit(
                            &context.agent_id,
                            &context.session_id,
                            EventPayload::ThinkingEnd,
                        );
                        thinking_ended = true;
                    }
                    event_bus::emit(
                        &context.agent_id,
                        &context.session_id,
                        EventPayload::ToolCallDelta {
                            tool_id: tool_call.id,
                            tool_name: tool_call.name,
                            arguments_text: tool_call.arguments,
                        },
                    );
                }
                Ok(LlmResponse::Done) => {
                    ended_with_done = true;
                    let usage_snapshot = super::stream_events::UsageSnapshot::from_estimate(
                        input_chars,
                        output_chars_this_turn,
                    );
                    usage.add(&usage_snapshot);
                    event_bus::emit(
                        &context.agent_id,
                        &context.session_id,
                        EventPayload::UsageUpdate {
                            input_tokens: usage.total.input_tokens,
                            output_tokens: usage.total.output_tokens,
                        },
                    );
                    if !pending_tool_calls.is_empty() {
                        if pending_tool_calls
                            .iter()
                            .any(|call| call.name == "spawn_subagent")
                        {
                            used_subagent_tool = true;
                        }
                        let result =
                            execute_tools(context, std::mem::take(&mut pending_tool_calls)).await;
                        executed_any_tools = true;

                        messages.push(ChatMessage {
                            role: "assistant".to_string(),
                            blocks: result.tool_call_blocks,
                        });
                        messages.push(ChatMessage {
                            role: "user".to_string(),
                            blocks: result.tool_results,
                        });

                        if interrupts::is_interrupted(&context.session_id).await {
                            interrupts::clear_interrupt(&context.session_id).await;
                            event_bus::emit(
                                &context.agent_id,
                                &context.session_id,
                                EventPayload::Interrupted,
                            );
                            return Ok(assistant_text.clone());
                        }

                        // continue outer loop (next turn)
                        continue_after_tools = true;
                        break;
                    }

                    // No tool calls → agent is done
                    enforce_completion_policy(context, assistant_text, used_subagent_tool)?;
                    event_bus::emit(&context.agent_id, &context.session_id, EventPayload::Done);
                    return Ok(assistant_text.clone());
                }
                Err(e) => {
                    return Err(if executed_any_tools {
                        RhythmError::LlmErrorAfterToolExecution(e)
                    } else {
                        RhythmError::LlmError(e)
                    });
                }
            }
        }

        if continue_after_tools {
            continue;
        }

        // If stream ended without Done, handle remaining tool calls
        if !pending_tool_calls.is_empty() {
            if pending_tool_calls
                .iter()
                .any(|call| call.name == "spawn_subagent")
            {
                used_subagent_tool = true;
            }
            let result = execute_tools(context, std::mem::take(&mut pending_tool_calls)).await;
            executed_any_tools = true;

            messages.push(ChatMessage {
                role: "assistant".to_string(),
                blocks: result.tool_call_blocks,
            });
            messages.push(ChatMessage {
                role: "user".to_string(),
                blocks: result.tool_results,
            });

            if interrupts::is_interrupted(&context.session_id).await {
                interrupts::clear_interrupt(&context.session_id).await;
                event_bus::emit(
                    &context.agent_id,
                    &context.session_id,
                    EventPayload::Interrupted,
                );
                return Ok(assistant_text.clone());
            }

            // continue to next turn
            continue;
        }

        // Stream ended cleanly with no pending tool calls
        if ended_with_done {
            enforce_completion_policy(context, assistant_text, used_subagent_tool)?;
            return Ok(assistant_text.clone());
        }

        event_bus::emit(
            &context.agent_id,
            &context.session_id,
            EventPayload::TextDelta {
                content: "\n[Error: model stream ended unexpectedly]".to_string(),
            },
        );
        let message = "Model stream ended unexpectedly before completion".to_string();
        return Err(if executed_any_tools {
            RhythmError::LlmErrorAfterToolExecution(message)
        } else {
            RhythmError::LlmError(message)
        });
    }

    // The loop exits only through Done, interrupt, stream error, or an optional future turn limit.
}

fn enforce_completion_policy(
    context: &QueryContext,
    assistant_text: &str,
    used_subagent_tool: bool,
) -> Result<(), RhythmError> {
    if context.requires_delegation_for_completion && !used_subagent_tool {
        let message = if context.completion.strategy == "delegate_then_summarize" {
            "This task requires delegation before completion. Use `spawn_subagent` for the substantial work, then summarize the returned results."
        } else {
            "This task must delegate before it can be completed."
        };
        event_bus::emit(
            &context.agent_id,
            &context.session_id,
            EventPayload::TextDelta {
                content: format!(
                    "\n[Policy] {} Final inline answer blocked: {}",
                    message,
                    assistant_text.trim()
                ),
            },
        );
        return Err(RhythmError::PolicyViolation(message.to_string()));
    }
    Ok(())
}

// ─── Tool execution helpers ──────────────────────────────────────────────────

struct ToolExecutionBatch {
    tool_call_blocks: Vec<ChatMessageBlock>,
    tool_results: Vec<ChatMessageBlock>,
}

fn parse_tool_arguments(tool_call: &LlmToolCall) -> Result<Value, String> {
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

fn tool_call_arguments_for_history(tool_call: &LlmToolCall) -> Value {
    match parse_tool_arguments(tool_call) {
        Ok(args) => args,
        Err(_) if tool_call.arguments.trim().is_empty() => json!({}),
        Err(_) => json!({ "_raw": tool_call.arguments }),
    }
}

async fn execute_tools(context: &QueryContext, tool_calls: Vec<LlmToolCall>) -> ToolExecutionBatch {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domains::permissions::PermissionChecker;
    use crate::domains::tools::ToolRegistry;
    use crate::platform::config::PermissionConfig;
    use crate::platform::config::{ResolvedCompletionPolicy, ResolvedDelegationPolicy};
    use crate::platform::llm::{ChatMessage, LlmClient, LlmResponse, LlmResponseStream};
    use async_trait::async_trait;
    use futures::stream;
    use serde_json::json;
    use std::path::PathBuf;
    use std::sync::Arc;

    struct MockLlmClient {
        text: String,
    }

    #[async_trait]
    impl LlmClient for MockLlmClient {
        async fn chat_stream(
            &self,
            _messages: Vec<ChatMessage>,
            _tools: Vec<crate::platform::llm::LlmToolDefinition>,
        ) -> Result<LlmResponseStream, String> {
            Ok(Box::pin(stream::iter(vec![
                Ok(LlmResponse::TextDelta(self.text.clone())),
                Ok(LlmResponse::Done),
            ])))
        }
    }

    fn make_context(requires_delegation_for_completion: bool) -> QueryContext {
        QueryContext {
            api_client: Arc::new(MockLlmClient {
                text: "inline answer".to_string(),
            }),
            tool_registry: Arc::new(ToolRegistry::new()),
            permission_checker: Arc::new(PermissionChecker::new(&PermissionConfig::default())),
            hook_executor: None,
            mcp_manager: None,
            cwd: PathBuf::from("."),
            provider_id: "test".to_string(),
            model: "test-model".to_string(),
            reasoning: None,
            system_prompt: String::new(),
            agent_turn_limit: Some(4),
            definition_id: "chat".to_string(),
            delegation: ResolvedDelegationPolicy {
                id: Some("chat_delegate".to_string()),
                enabled: true,
                root_may_execute: false,
                max_subagents_per_turn: Some(3),
            },
            completion: ResolvedCompletionPolicy {
                id: Some("delegate_then_summarize".to_string()),
                strategy: "delegate_then_summarize".to_string(),
            },
            requires_delegation_for_completion,
            agent_id: "agent-test".to_string(),
            session_id: "session-test".to_string(),
        }
    }

    #[tokio::test]
    async fn blocks_inline_completion_when_delegation_is_required() {
        let context = make_context(true);
        let mut messages = vec![ChatMessage {
            role: "user".to_string(),
            blocks: vec![crate::platform::llm::ChatMessageBlock::Text {
                text: "Write a novel outline".to_string(),
            }],
        }];
        let mut usage = UsageTracker::default();

        let result = run_query(&context, &mut messages, &mut usage).await;

        assert!(matches!(result, Err(RhythmError::PolicyViolation(_))));
    }

    #[tokio::test]
    async fn allows_inline_completion_when_delegation_is_not_required() {
        let context = make_context(false);
        let mut messages = vec![ChatMessage {
            role: "user".to_string(),
            blocks: vec![crate::platform::llm::ChatMessageBlock::Text {
                text: "Hello".to_string(),
            }],
        }];
        let mut usage = UsageTracker::default();

        let result = run_query(&context, &mut messages, &mut usage).await;

        assert_eq!(result.expect("query should succeed"), "inline answer");
    }

    #[test]
    fn rejects_invalid_tool_arguments_instead_of_coercing_to_null() {
        let tool_call = LlmToolCall {
            id: "tool-1".to_string(),
            name: "plan_tasks".to_string(),
            arguments: "{".to_string(),
        };

        let error = parse_tool_arguments(&tool_call).unwrap_err();

        assert!(error.contains("invalid JSON arguments"));
        assert!(error.contains("plan_tasks"));
    }

    #[test]
    fn preserves_raw_invalid_arguments_for_history() {
        let tool_call = LlmToolCall {
            id: "tool-1".to_string(),
            name: "plan_tasks".to_string(),
            arguments: "{".to_string(),
        };

        assert_eq!(
            tool_call_arguments_for_history(&tool_call),
            json!({ "_raw": "{" })
        );
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

    // ── Permission check ─────────────────────────────────────────────────────
    let file_path = args
        .get("path")
        .and_then(|v| v.as_str())
        .and_then(|p| resolve_permission_path(&context.cwd, p).ok());
    let command = args
        .get("command")
        .and_then(|v| v.as_str())
        .map(String::from);

    let decision = context.permission_checker.evaluate(
        tool_name,
        tool.is_read_only(),
        file_path.as_deref(),
        command.as_deref(),
    );

    if !decision.allowed {
        if decision.requires_confirmation {
            if agents::is_swarm_worker() {
                let team_name = agents::get_team_name().unwrap_or_default();
                let worker_id = agents::get_agent_id().unwrap_or_else(|| context.agent_id.clone());
                let request = crate::domains::swarm::permission_sync::SwarmPermissionRequest {
                    id: format!("perm-{}", tool_id),
                    worker_id: worker_id.clone(),
                    worker_name: worker_id,
                    team_name: team_name.clone(),
                    tool_name: tool_name.clone(),
                    tool_use_id: tool_id.clone(),
                    description: decision.reason.clone(),
                    input: args.clone(),
                    status: "pending".to_string(),
                    resolved_by: None,
                    feedback: None,
                };

                if let Err(e) =
                    crate::domains::swarm::permission_sync::write_permission_request(&request)
                {
                    return ChatMessageBlock::ToolResult {
                        tool_call_id: tool_id.clone(),
                        content: format!("Failed to create swarm permission request: {}", e),
                        is_error: true,
                    };
                }

                match crate::domains::swarm::permission_sync::wait_for_permission_response(
                    &team_name,
                    &request.id,
                    300_000,
                )
                .await
                {
                    Ok(response) if response.allowed => {}
                    Ok(response) => {
                        return ChatMessageBlock::ToolResult {
                            tool_call_id: tool_id.clone(),
                            content: format!(
                                "Permission denied for '{}': {}",
                                tool_name,
                                response
                                    .feedback
                                    .unwrap_or_else(|| "leader rejected".to_string())
                            ),
                            is_error: true,
                        };
                    }
                    Err(e) => {
                        return ChatMessageBlock::ToolResult {
                            tool_call_id: tool_id.clone(),
                            content: format!("Permission denied for '{}': {}", tool_name, e),
                            is_error: true,
                        };
                    }
                }
            } else {
                // Emit PermissionRequest and wait for frontend approval
                let (tx, rx) = oneshot::channel::<bool>();
                permissions::set_permission_waiter(tool_id.clone(), tx).await;

                event_bus::emit(
                    &context.agent_id,
                    &context.session_id,
                    EventPayload::PermissionRequest {
                        tool_id: tool_id.clone(),
                        tool_name: tool_name.clone(),
                        reason: decision.reason.clone(),
                    },
                );

                let approved = tokio::select! {
                    approved = rx => approved.ok(),
                    _ = wait_for_interrupt(&context.session_id) => None,
                };

                if approved.is_none() {
                    permissions::remove_permission_waiter(tool_id).await;
                }

                match approved {
                    Some(true) => { /* approved — fall through to execute */ }
                    _ => {
                        return ChatMessageBlock::ToolResult {
                            tool_call_id: tool_id.clone(),
                            content: if interrupts::is_interrupted(&context.session_id).await {
                                format!("Tool '{}' interrupted", tool_name)
                            } else {
                                format!("Permission denied for '{}': user rejected", tool_name)
                            },
                            is_error: true,
                        };
                    }
                }
            }
        } else {
            return ChatMessageBlock::ToolResult {
                tool_call_id: tool_id.clone(),
                content: format!("Permission denied for '{}': {}", tool_name, decision.reason),
                is_error: true,
            };
        }
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

async fn wait_for_interrupt(session_id: &str) {
    loop {
        if interrupts::is_interrupted(session_id).await {
            return;
        }
        sleep(Duration::from_millis(50)).await;
    }
}
