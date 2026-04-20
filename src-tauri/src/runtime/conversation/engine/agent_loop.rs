use futures::StreamExt;

use super::agent_policy::enforce_completion_policy;
use super::agent_streaming::{emit_thinking_end_once, estimate_input_chars, record_turn_usage};
use super::agent_tools::execute_tools;
use super::context::QueryContext;
use super::stream_events::UsageTracker;
use crate::infra::event_bus;
use crate::infra::llm::{ChatMessage, LlmResponse, LlmToolDefinition};
use crate::runtime::conversation::interrupts;
use crate::runtime::policy::hooks::events::HookEvent;
use crate::shared::error::RhythmError;
use crate::shared::schema::EventPayload;

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
        let input_chars = estimate_input_chars(messages);
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
                    emit_thinking_end_once(context, &mut thinking_ended);
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
                    emit_thinking_end_once(context, &mut thinking_ended);
                }
                Ok(LlmResponse::ToolCall(tool_call)) => {
                    emit_thinking_end_once(context, &mut thinking_ended);
                    pending_tool_calls.push(tool_call);
                }
                Ok(LlmResponse::ToolCallDelta(tool_call)) => {
                    emit_thinking_end_once(context, &mut thinking_ended);
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
                    record_turn_usage(context, usage, input_chars, output_chars_this_turn);
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

// ─── Tool execution helpers ──────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::super::agent_tools::parse_tool_arguments;
    use super::super::agent_tools::tool_call_arguments_for_history;
    use super::*;
    use crate::infra::config::PermissionConfig;
    use crate::infra::config::{ResolvedCompletionPolicy, ResolvedDelegationPolicy};
    use crate::infra::llm::{ChatMessage, LlmClient, LlmResponse, LlmResponseStream, LlmToolCall};
    use crate::runtime::capabilities::tools::ToolRegistry;
    use crate::runtime::policy::permissions::PermissionChecker;
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
            _tools: Vec<crate::infra::llm::LlmToolDefinition>,
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
            blocks: vec![crate::infra::llm::ChatMessageBlock::Text {
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
            blocks: vec![crate::infra::llm::ChatMessageBlock::Text {
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
