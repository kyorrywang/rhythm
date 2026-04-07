use futures::StreamExt;
use serde_json::Value;
use std::collections::HashMap;
use tokio::sync::oneshot;

use super::compactor::{auto_compact_if_needed, AutoCompactState};
use super::context::QueryContext;
use super::stream_events::UsageTracker;
use crate::coordinator::coordinator_mode;
use crate::hooks::events::HookEvent;
use crate::infrastructure::event_bus;
use crate::llm::{ChatMessage, ChatMessageBlock, LlmResponse, LlmToolCall, LlmToolDefinition};
use crate::runtime::{interrupts, permissions};
use crate::shared::error::RhythmError;
use crate::shared::schema::EventPayload;
use crate::tools::context::resolve_permission_path;
use crate::tools::{ToolExecutionContext, ToolResult};

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

    // AutoCompact state: persisted across turns within one query
    let mut compact_state = AutoCompactState::default();
    let threshold_ratio = context.auto_compact_threshold_ratio.clamp(0.1, 1.0);
    let token_limit = ((context.max_tokens as f32) * threshold_ratio) as usize;
    let max_micro_compacts = context.max_micro_compacts;

    let mut turn = 0usize;
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
                event_bus::emit(&context.agent_id, &context.session_id, EventPayload::Done);
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

        // ── AutoCompact check before calling LLM ─────────────────────────────
        if context.auto_compact_enabled {
            let msgs_snapshot = messages.clone();
            let compact_result = auto_compact_if_needed(
                msgs_snapshot,
                context.api_client.as_ref(),
                &context.model,
                &context.system_prompt,
                &mut compact_state,
                token_limit,
                max_micro_compacts,
            )
            .await;

            if compact_result.was_compacted {
                *messages = compact_result.messages;
                let compact_type_str = compact_result
                    .compact_type
                    .as_ref()
                    .map(|ct| format!("{:?}", ct).to_lowercase())
                    .unwrap_or_default();
                event_bus::emit(
                    &context.agent_id,
                    &context.session_id,
                    EventPayload::ContextCompacted {
                        compact_type: compact_type_str,
                        tokens_saved: compact_result.tokens_saved,
                    },
                );
            }
        }

        let mut thinking_ended = false;
        let mut thinking_started_at: Option<std::time::Instant> = None;
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
                    if thinking_started_at.is_none() {
                        thinking_started_at = Some(std::time::Instant::now());
                    }
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
                        let elapsed = thinking_started_at
                            .map(|t| t.elapsed().as_millis() as u64)
                            .unwrap_or(0);
                        event_bus::emit(
                            &context.agent_id,
                            &context.session_id,
                            EventPayload::ThinkingEnd {
                                time_cost_ms: elapsed,
                            },
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
                    let elapsed = thinking_started_at
                        .map(|t| t.elapsed().as_millis() as u64)
                        .unwrap_or(0);
                    event_bus::emit(
                        &context.agent_id,
                        &context.session_id,
                        EventPayload::ThinkingEnd {
                            time_cost_ms: elapsed,
                        },
                    );
                    thinking_ended = true;
                }
                Ok(LlmResponse::ToolCall(tool_call)) => {
                    if !thinking_ended {
                        let elapsed = thinking_started_at
                            .map(|t| t.elapsed().as_millis() as u64)
                            .unwrap_or(0);
                        event_bus::emit(
                            &context.agent_id,
                            &context.session_id,
                            EventPayload::ThinkingEnd {
                                time_cost_ms: elapsed,
                            },
                        );
                        thinking_ended = true;
                    }
                    pending_tool_calls.push(tool_call);
                }
                Ok(LlmResponse::Done) => {
                    ended_with_done = true;
                    usage.add(&super::stream_events::UsageSnapshot::from_estimate(
                        input_chars,
                        output_chars_this_turn,
                    ));
                    if !pending_tool_calls.is_empty() {
                        let result =
                            execute_tools(context, std::mem::take(&mut pending_tool_calls)).await;

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
                    event_bus::emit(&context.agent_id, &context.session_id, EventPayload::Done);
                    return Ok(assistant_text.clone());
                }
                Err(e) => return Err(RhythmError::LlmError(e)),
            }
        }

        if continue_after_tools {
            continue;
        }

        // If stream ended without Done, handle remaining tool calls
        if !pending_tool_calls.is_empty() {
            let result = execute_tools(context, std::mem::take(&mut pending_tool_calls)).await;

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
            return Ok(assistant_text.clone());
        }

        event_bus::emit(
            &context.agent_id,
            &context.session_id,
            EventPayload::TextDelta {
                content: "\n[Error: model stream ended unexpectedly]".to_string(),
            },
        );
        event_bus::emit(&context.agent_id, &context.session_id, EventPayload::Done);
        return Err(RhythmError::LlmError(
            "Model stream ended unexpectedly before completion".to_string(),
        ));
    }

    // The loop exits only through Done, interrupt, stream error, or an optional future turn limit.
}

// ─── Tool execution helpers ──────────────────────────────────────────────────

struct ToolExecutionBatch {
    tool_call_blocks: Vec<ChatMessageBlock>,
    tool_results: Vec<ChatMessageBlock>,
}

async fn execute_tools(context: &QueryContext, tool_calls: Vec<LlmToolCall>) -> ToolExecutionBatch {
    let tool_call_blocks: Vec<ChatMessageBlock> = tool_calls
        .iter()
        .map(|tc| {
            let args: Value = serde_json::from_str(&tc.arguments).unwrap_or(Value::Null);
            ChatMessageBlock::ToolCall {
                id: tc.id.clone(),
                name: tc.name.clone(),
                arguments: args,
            }
        })
        .collect();

    let mut tool_results = Vec::new();

    for tool_call in &tool_calls {
        let args: Value = serde_json::from_str(&tool_call.arguments).unwrap_or(Value::Null);

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
    }

    ToolExecutionBatch {
        tool_call_blocks,
        tool_results,
    }
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
            if coordinator_mode::is_swarm_worker() {
                let team_name = coordinator_mode::get_team_name().unwrap_or_default();
                let worker_id =
                    coordinator_mode::get_agent_id().unwrap_or_else(|| context.agent_id.clone());
                let request = crate::swarm::permission_sync::SwarmPermissionRequest {
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

                if let Err(e) = crate::swarm::permission_sync::write_permission_request(&request) {
                    return ChatMessageBlock::ToolResult {
                        tool_call_id: tool_id.clone(),
                        content: format!("Failed to create swarm permission request: {}", e),
                        is_error: true,
                    };
                }

                match crate::swarm::permission_sync::wait_for_permission_response(
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

                match rx.await {
                    Ok(true) => { /* approved — fall through to execute */ }
                    _ => {
                        return ChatMessageBlock::ToolResult {
                            tool_call_id: tool_id.clone(),
                            content: format!(
                                "Permission denied for '{}': user rejected",
                                tool_name
                            ),
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
        metadata: HashMap::new(),
    };

    let result: ToolResult = tool.execute(args.clone(), &tool_ctx).await;
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
