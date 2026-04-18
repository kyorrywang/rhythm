use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::ipc::Channel;
use tokio::time::{sleep, Duration};

use crate::engine::{QueryContext, QueryEngine};
use crate::hooks::executor::HookExecutor;
use crate::hooks::loader::load_hook_registry_for_cwd;
use crate::infrastructure::config;
use crate::infrastructure::event_bus;
use crate::llm;
use crate::llm::{ChatAttachment, LlmClient};
use crate::mcp::McpClientManager;
use crate::permissions::PermissionChecker;
use crate::prompts::builder::build_runtime_prompt;
use crate::runtime::{ask, interrupts, permissions, session_tree, sessions};
use crate::shared::schema::{EventPayload, ServerEventChunk};
use crate::swarm::agent_registry;
use crate::tools::ToolRegistry;
use tokio::sync::Mutex;
use crate::infrastructure::session_repository::{self, MessageSegmentSnapshot, MessageSnapshot, SessionSnapshot};
use crate::llm::{ChatMessage, ChatMessageBlock};

const CHAT_AUTO_RETRY_DELAY_MS: u64 = 10_000;
const CHAT_TRANSIENT_RETRY_DELAY_MS: u64 = 2_000;
const CHAT_MAX_TRANSIENT_RETRIES: u32 = 2;

fn effective_allowed_tools(
    runtime_spec: &config::ResolvedAgentSpec,
) -> Option<&[String]> {
    if runtime_spec.agent.permissions.locked {
        return Some(&runtime_spec.permission.allowed_tools);
    }
    if runtime_spec.permission.allowed_tools.is_empty() {
        None
    } else {
        Some(&runtime_spec.permission.allowed_tools)
    }
}

fn effective_disallowed_tools(
    runtime_spec: &config::ResolvedAgentSpec,
) -> Option<&[String]> {
    if runtime_spec.permission.denied_tools.is_empty() {
        None
    } else {
        Some(&runtime_spec.permission.denied_tools)
    }
}

fn runtime_state_message(
    state: &str,
    reason: Option<&str>,
    attempt: u32,
    retry_in_seconds: Option<u32>,
) -> String {
    match state {
        "starting" => "正在启动会话流。".to_string(),
        "streaming" => "正在流式生成。".to_string(),
        "backoff_waiting" => match reason {
            Some("rate_limit") => format!(
                "429 Too Many Requests，第 {} 次自动重试将在 {} 秒后开始。",
                attempt.max(1),
                retry_in_seconds.unwrap_or((CHAT_AUTO_RETRY_DELAY_MS / 1000) as u32)
            ),
            _ => format!(
                "连接暂时异常，第 {} 次自动重试将在 {} 秒后开始。",
                attempt.max(1),
                retry_in_seconds.unwrap_or((CHAT_TRANSIENT_RETRY_DELAY_MS / 1000) as u32)
            ),
        },
        "retrying" => format!("正在发起第 {} 次重试...", attempt.max(1)),
        "interrupted" => "会话已中断。".to_string(),
        "completed" => "会话已完成。".to_string(),
        "failed" => "会话失败。".to_string(),
        _ => "会话状态已更新。".to_string(),
    }
}

/// Primary streaming entry point.  Builds the full QueryContext and runs the engine.
#[tauri::command]
pub async fn chat_stream(
    session_id: String,
    prompt: String,
    attachments: Option<Vec<ChatAttachment>>,
    cwd: Option<String>,
    agent_id: Option<String>,
    permission_mode: Option<String>,
    allowed_tools: Option<Vec<String>>,
    disallowed_tools: Option<Vec<String>>,
    provider_id: Option<String>,
    model: Option<String>,
    reasoning: Option<String>,
    on_event: Channel<ServerEventChunk>,
) -> Result<(), String> {
    let settings = config::load_settings();
    let runtime_spec = config::resolve_runtime_spec(
        &settings,
        config::RuntimeIntent {
            agent_id: agent_id.clone(),
            provider_id: provider_id.clone(),
            model_id: model.clone(),
            reasoning: reasoning.clone(),
            permission_mode: permission_mode.as_deref().map(crate::permissions::modes::PermissionMode::from_str),
            allowed_tools: allowed_tools.clone(),
            disallowed_tools: disallowed_tools.clone(),
        },
    )?;
    let llm_config = runtime_spec.llm.clone();

    let agent_id = agent_registry::register_agent(session_id.clone(), None, 0);
    event_bus::register_ipc_channel(&agent_id, on_event.clone());
    sessions::register_session(session_id.clone(), agent_id.clone()).await;
    let cwd_path = crate::commands::workspace::resolve_workspace_path(cwd.as_deref())?;

    tokio::spawn(async move {
        let heartbeat_running = Arc::new(AtomicBool::new(true));
        let heartbeat_flag = heartbeat_running.clone();
        let heartbeat_agent_id = agent_id.clone();
        let heartbeat_session_id = session_id.clone();
        tokio::spawn(async move {
            while heartbeat_flag.load(Ordering::Relaxed) {
                sleep(Duration::from_secs(2)).await;
                if !heartbeat_flag.load(Ordering::Relaxed) {
                    break;
                }
                event_bus::emit(&heartbeat_agent_id, &heartbeat_session_id, EventPayload::Heartbeat);
            }
        });

        let client: Arc<dyn LlmClient> = Arc::from(llm::create_client(&llm_config));

        // Build multi-layer system prompt
        let system_prompt = build_runtime_prompt(
            &settings,
            &cwd_path,
            Some(&prompt),
            &runtime_spec,
        );

        let merged_mcp_configs = McpClientManager::merged_server_configs(&settings, &cwd_path);
        let mcp_manager = if merged_mcp_configs.is_empty() {
            None
        } else {
            let mut manager = McpClientManager::new(merged_mcp_configs);
            manager.connect_all().await;
            Some(Arc::new(Mutex::new(manager)))
        };

        let loaded_plugins = crate::plugins::load_plugins(&settings, &cwd_path);
        let tool_registry = Arc::new(ToolRegistry::create_for_agent_with_plugins(
            &loaded_plugins,
            mcp_manager.clone(),
            effective_allowed_tools(&runtime_spec),
            effective_disallowed_tools(&runtime_spec),
        ));
        let permission_checker = Arc::new(PermissionChecker::new(&runtime_spec.permission));

        let hook_executor = load_hook_registry_for_cwd(&settings, &cwd_path);
        let hook_executor = Arc::new(HookExecutor::new(hook_executor));

        let attachments = attachments.unwrap_or_default();
        let requires_delegation_for_completion =
            config::should_delegate_task(&runtime_spec, &prompt, attachments.len());
        let mut retry_attempt: u32 = 0;
        emit_runtime_status(
            &agent_id,
            &session_id,
            "starting",
            None,
            None,
            None,
            None,
        );

        loop {
            if interrupts::is_interrupted(&session_id).await {
                interrupts::clear_interrupt(&session_id).await;
                emit_runtime_status(
                    &agent_id,
                    &session_id,
                    "interrupted",
                    Some("interrupt"),
                    None,
                    None,
                    None,
                );
                event_bus::emit(&agent_id, &session_id, EventPayload::Interrupted);
                break;
            }

            let context = QueryContext {
                api_client: client.clone(),
                tool_registry: tool_registry.clone(),
                permission_checker: permission_checker.clone(),
                hook_executor: Some(hook_executor.clone()),
                mcp_manager: mcp_manager.clone(),
                cwd: cwd_path.clone(),
                provider_id: provider_id
                    .clone()
                    .unwrap_or_else(|| llm_config.name.clone()),
                model: llm_config.model.clone(),
                reasoning: runtime_spec.reasoning.clone(),
                system_prompt: system_prompt.clone(),
                agent_turn_limit: runtime_spec.agent_turn_limit,
                definition_id: runtime_spec.agent.id.clone(),
                delegation: runtime_spec.delegation.clone(),
                completion: runtime_spec.completion.clone(),
                requires_delegation_for_completion,
                agent_id: agent_id.clone(),
                session_id: session_id.clone(),
            };

            let mut engine = QueryEngine::new(context);
            if let Ok(history) = load_session_history(&cwd_path, &session_id, &prompt, &attachments).await {
                if !history.is_empty() {
                    engine.set_messages(history);
                }
            }
            emit_runtime_status(
                &agent_id,
                &session_id,
                if retry_attempt > 0 { "retrying" } else { "streaming" },
                None,
                Some(retry_attempt),
                None,
                None,
            );

            match engine
                .submit_message_with_attachments(prompt.clone(), attachments.clone())
                .await
            {
                Ok(_) => {
                    emit_runtime_status(
                        &agent_id,
                        &session_id,
                        "completed",
                        Some("completed"),
                        Some(retry_attempt),
                        None,
                        None,
                    );
                    break;
                }
                Err(e) if e.is_safe_to_retry() && is_retryable_rate_limit_error(&e.message()) => {
                    retry_attempt += 1;
                    let retry_at = current_time_millis() + CHAT_AUTO_RETRY_DELAY_MS;
                    emit_runtime_status(
                        &agent_id,
                        &session_id,
                        "backoff_waiting",
                        Some("rate_limit"),
                        Some(retry_attempt),
                        Some((CHAT_AUTO_RETRY_DELAY_MS / 1000) as u32),
                        Some(retry_at),
                    );
                    eprintln!(
                        "Generation rate-limited, retrying in {} ms: {}",
                        CHAT_AUTO_RETRY_DELAY_MS, e.message()
                    );
                    if wait_for_retry_or_interrupt(
                        &agent_id,
                        &session_id,
                        retry_attempt,
                        retry_at,
                        Some("rate_limit"),
                        CHAT_AUTO_RETRY_DELAY_MS,
                    ).await {
                        emit_runtime_status(
                            &agent_id,
                            &session_id,
                            "interrupted",
                            Some("interrupt"),
                            Some(retry_attempt),
                            None,
                            None,
                        );
                        event_bus::emit(&agent_id, &session_id, EventPayload::Interrupted);
                        break;
                    }
                    emit_runtime_status(
                        &agent_id,
                        &session_id,
                        "retrying",
                        Some("rate_limit"),
                        Some(retry_attempt),
                        None,
                        None,
                    );
                }
                Err(e)
                    if e.is_safe_to_retry()
                        && retry_attempt < CHAT_MAX_TRANSIENT_RETRIES
                        && is_retryable_transient_error(&e.message()) =>
                {
                    retry_attempt += 1;
                    let retry_at = current_time_millis() + CHAT_TRANSIENT_RETRY_DELAY_MS;
                    emit_runtime_status(
                        &agent_id,
                        &session_id,
                        "backoff_waiting",
                        Some("unknown"),
                        Some(retry_attempt),
                        Some((CHAT_TRANSIENT_RETRY_DELAY_MS / 1000) as u32),
                        Some(retry_at),
                    );
                    eprintln!(
                        "Generation transient failure, retrying in {} ms: {}",
                        CHAT_TRANSIENT_RETRY_DELAY_MS, e.message()
                    );
                    if wait_for_retry_or_interrupt(
                        &agent_id,
                        &session_id,
                        retry_attempt,
                        retry_at,
                        Some("unknown"),
                        CHAT_TRANSIENT_RETRY_DELAY_MS,
                    ).await {
                        emit_runtime_status(
                            &agent_id,
                            &session_id,
                            "interrupted",
                            Some("interrupt"),
                            Some(retry_attempt),
                            None,
                            None,
                        );
                        event_bus::emit(&agent_id, &session_id, EventPayload::Interrupted);
                        break;
                    }
                    emit_runtime_status(
                        &agent_id,
                        &session_id,
                        "retrying",
                        Some("unknown"),
                        Some(retry_attempt),
                        None,
                        None,
                    );
                }
                Err(e) => {
                    eprintln!("Generation error: {}", e.message());
                    emit_runtime_status(
                        &agent_id,
                        &session_id,
                        "failed",
                        Some("error"),
                        Some(retry_attempt),
                        None,
                        None,
                    );
                    event_bus::emit(
                        &agent_id,
                        &session_id,
                        EventPayload::TextDelta {
                            content: format!("\n[Error: {}]", e.message()),
                        },
                    );
                    event_bus::emit(&agent_id, &session_id, EventPayload::Failed);
                    break;
                }
            }
        }

        heartbeat_running.store(false, Ordering::Relaxed);
        event_bus::unregister(&agent_id);
        agent_registry::unregister_agent(&agent_id);
        session_tree::unregister_session_tree(&session_id).await;
        sessions::unregister_session(session_id).await;
    });

    Ok(())
}

#[tauri::command]
pub async fn attach_session_stream(
    session_id: String,
    after_event_id: Option<u64>,
    on_event: Channel<ServerEventChunk>,
) -> Result<bool, String> {
    let Some(session_info) = sessions::get_session_info(&session_id).await else {
        return Ok(false);
    };

    event_bus::attach_ipc_channel(&session_info.agent_id, on_event, after_event_id);
    Ok(true)
}

fn is_retryable_rate_limit_error(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("429")
        || normalized.contains("too many requests")
        || normalized.contains("rate limit")
}

fn is_retryable_transient_error(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    let transient_markers = [
        "connection reset",
        "connection aborted",
        "connection closed",
        "broken pipe",
        "timed out",
        "timeout",
        "temporarily unavailable",
        "temporary failure",
        "unexpected eof",
        "eof while",
        "stream ended unexpectedly",
        "network error",
        "transport error",
        "http2 error",
        "tls",
        "socket",
        "io error",
    ];
    transient_markers.iter().any(|marker| normalized.contains(marker))
}

fn emit_runtime_status(
    agent_id: &str,
    session_id: &str,
    state: &str,
    reason: Option<&str>,
    attempt: Option<u32>,
    retry_in_seconds: Option<u32>,
    retry_at: Option<u64>,
) {
    let normalized_attempt = attempt.unwrap_or(0);
    event_bus::emit(
        agent_id,
        session_id,
        EventPayload::RuntimeStatus {
            state: state.to_string(),
            reason: reason.map(str::to_string),
            message: runtime_state_message(state, reason, normalized_attempt, retry_in_seconds),
            attempt: normalized_attempt,
            retry_in_seconds,
            retry_at,
        },
    );
}

async fn wait_for_retry_or_interrupt(
    agent_id: &str,
    session_id: &str,
    attempt: u32,
    retry_at: u64,
    reason: Option<&str>,
    total_delay_ms: u64,
) -> bool {
    let mut remaining_ms = total_delay_ms;
    while remaining_ms > 0 {
        if interrupts::is_interrupted(session_id).await {
            interrupts::clear_interrupt(session_id).await;
            return true;
        }
        let step_ms = remaining_ms.min(250);
        sleep(Duration::from_millis(step_ms)).await;
        remaining_ms -= step_ms;
        if remaining_ms % 1_000 == 0 && remaining_ms > 0 {
            let seconds = (remaining_ms / 1_000) as u32;
            emit_runtime_status(
                agent_id,
                session_id,
                "backoff_waiting",
                reason,
                Some(attempt),
                Some(seconds),
                Some(retry_at),
            );
        }
    }
    if interrupts::is_interrupted(session_id).await {
        interrupts::clear_interrupt(session_id).await;
        return true;
    }
    false
}

async fn load_session_history(
    cwd_path: &std::path::Path,
    session_id: &str,
    prompt: &str,
    attachments: &[ChatAttachment],
) -> Result<Vec<ChatMessage>, String> {
    let Some(snapshot) = session_repository::get_session(cwd_path, session_id).await? else {
        return Ok(Vec::new());
    };

    Ok(rebuild_history_from_snapshot(snapshot, prompt, attachments))
}

fn rebuild_history_from_snapshot(
    snapshot: SessionSnapshot,
    prompt: &str,
    attachments: &[ChatAttachment],
) -> Vec<ChatMessage> {
    let mut messages: Vec<ChatMessage> = snapshot
        .messages
        .into_iter()
        .filter(|message| message.context_policy.as_deref() != Some("exclude"))
        .flat_map(snapshot_message_to_chat_messages)
        .collect();

    trim_pending_current_turn(&mut messages, prompt, attachments);
    messages
}

fn trim_pending_current_turn(
    messages: &mut Vec<ChatMessage>,
    prompt: &str,
    attachments: &[ChatAttachment],
) {
    while let Some(last) = messages.last() {
        let only_empty_assistant = last.role == "assistant"
            && !last
                .blocks
                .iter()
                .any(|block| matches!(block, ChatMessageBlock::Text { text } if !text.trim().is_empty())
                    || matches!(block, ChatMessageBlock::ToolCall { .. })
                    || matches!(block, ChatMessageBlock::ToolResult { .. }));
        if only_empty_assistant {
            messages.pop();
            continue;
        }
        break;
    }

    if matches!(
        messages.last(),
        Some(ChatMessage {
            role,
            blocks: _
        }) if role == "assistant"
    ) {
        let should_trim_assistant = messages
            .len()
            .checked_sub(2)
            .and_then(|index| messages.get(index))
            .map(|message| user_message_matches_turn(message, prompt, attachments))
            .unwrap_or(false);
        if should_trim_assistant {
            messages.pop();
        }
    }

    if matches!(
        messages.last(),
        Some(message) if user_message_matches_turn(message, prompt, attachments)
    ) {
        messages.pop();
    }
}

fn user_message_matches_turn(
    message: &ChatMessage,
    prompt: &str,
    attachments: &[ChatAttachment],
) -> bool {
    message.role == "user"
        && extract_text_from_blocks(&message.blocks).trim() == prompt.trim()
        && blocks_match_attachments(&message.blocks, attachments)
}

fn snapshot_message_to_chat_messages(message: MessageSnapshot) -> Vec<ChatMessage> {
    let role = message.role;
    let mut message_blocks = Vec::new();
    let mut tool_result_blocks = Vec::new();

    if let Some(content) = message.content {
        if !content.trim().is_empty() {
            message_blocks.push(ChatMessageBlock::Text { text: content });
        }
    }

    for attachment in message.attachments.unwrap_or_default() {
        if attachment.kind == "image" {
            if let Some(data_url) = attachment.data_url.or(attachment.preview_url) {
                if let Some((media_type, data)) = parse_data_url(&data_url) {
                    message_blocks.push(ChatMessageBlock::Image { media_type, data });
                    continue;
                }
            }
        }

        message_blocks.push(ChatMessageBlock::File {
            name: attachment.name,
            mime_type: attachment.mime_type,
            size: attachment.size.max(0) as u64,
            text: attachment.text,
        });
    }

    for segment in message.segments.unwrap_or_default() {
        match segment {
            MessageSegmentSnapshot::Text { content } => {
                if !content.trim().is_empty() {
                    message_blocks.push(ChatMessageBlock::Text { text: content });
                }
            }
            MessageSegmentSnapshot::Tool { tool } => {
                message_blocks.push(ChatMessageBlock::ToolCall {
                    id: tool.id.clone(),
                    name: tool.name,
                    arguments: tool.arguments,
                });
                if let Some(result) = tool.result {
                    tool_result_blocks.push(ChatMessageBlock::ToolResult {
                        tool_call_id: tool.id,
                        content: result,
                        is_error: tool.status == "error",
                    });
                }
            }
            _ => {}
        }
    }

    let mut rebuilt = Vec::new();

    if !message_blocks.is_empty() {
        rebuilt.push(ChatMessage {
            role,
            blocks: message_blocks,
        });
    }

    if !tool_result_blocks.is_empty() {
        rebuilt.push(ChatMessage {
            role: "user".to_string(),
            blocks: tool_result_blocks,
        });
    }

    rebuilt
}

fn extract_text_from_blocks(blocks: &[ChatMessageBlock]) -> String {
    blocks
        .iter()
        .filter_map(|block| match block {
            ChatMessageBlock::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn blocks_match_attachments(blocks: &[ChatMessageBlock], attachments: &[ChatAttachment]) -> bool {
    let block_attachments: Vec<&ChatMessageBlock> = blocks
        .iter()
        .filter(|block| matches!(block, ChatMessageBlock::Image { .. } | ChatMessageBlock::File { .. }))
        .collect();

    if block_attachments.len() != attachments.len() {
        return false;
    }

    block_attachments
        .iter()
        .zip(attachments.iter())
        .all(|(block, attachment)| match (block, attachment.kind.as_str()) {
            (ChatMessageBlock::Image { .. }, "image") => true,
            (
                ChatMessageBlock::File {
                    name,
                    mime_type,
                    size,
                    text,
                },
                "file",
            ) => {
                name == &attachment.name
                    && mime_type == &attachment.mime_type
                    && *size == attachment.size
                    && text.as_deref() == attachment.text.as_deref()
            }
            _ => false,
        })
}

fn parse_data_url(data_url: &str) -> Option<(String, String)> {
    let (header, data) = data_url.split_once(',')?;
    let media_type = header
        .strip_prefix("data:")?
        .strip_suffix(";base64")?
        .to_string();
    Some((media_type, data.to_string()))
}

fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::session_repository::{MessageSegmentSnapshot, MessageSnapshot, ToolCallSnapshot};
    use serde_json::json;

    #[test]
    fn snapshot_tool_segments_rebuild_into_assistant_then_user_tool_result_messages() {
        let rebuilt = snapshot_message_to_chat_messages(MessageSnapshot {
            id: "m1".to_string(),
            role: "assistant".to_string(),
            content: None,
            attachments: None,
            mode: None,
            slash_command_name: None,
            context_policy: None,
            model: None,
            created_at: 1,
            segments: Some(vec![MessageSegmentSnapshot::Tool {
                tool: ToolCallSnapshot {
                    id: "tool-1".to_string(),
                    name: "plan_tasks".to_string(),
                    arguments: json!({ "workspace": "demo", "tasks": [] }),
                    raw_arguments: Some("{\"workspace\":\"demo\",\"tasks\":[]}".to_string()),
                    is_preparing: Some(false),
                    result: Some("{\"workspace_path\":\"demo\"}".to_string()),
                    status: "completed".to_string(),
                    logs: None,
                    started_at: Some(1),
                    ended_at: Some(2),
                    sub_session_id: None,
                },
            }]),
            status: None,
            started_at: Some(1),
            ended_at: Some(2),
        });

        assert_eq!(rebuilt.len(), 2);
        assert_eq!(rebuilt[0].role, "assistant");
        assert!(matches!(
            rebuilt[0].blocks.first(),
            Some(ChatMessageBlock::ToolCall { id, .. }) if id == "tool-1"
        ));
        assert_eq!(rebuilt[1].role, "user");
        assert!(matches!(
            rebuilt[1].blocks.first(),
            Some(ChatMessageBlock::ToolResult { tool_call_id, .. }) if tool_call_id == "tool-1"
        ));
    }

    #[test]
    fn rebuild_history_skips_messages_marked_excluded_from_context() {
        let rebuilt = rebuild_history_from_snapshot(
            SessionSnapshot {
                id: "s1".to_string(),
                title: "demo".to_string(),
                updated_at: 2,
                workspace_path: None,
                messages: vec![
                    MessageSnapshot {
                        id: "m1".to_string(),
                        role: "user".to_string(),
                        content: Some("keep me".to_string()),
                        attachments: None,
                        mode: None,
                        slash_command_name: None,
                        context_policy: None,
                        model: None,
                        created_at: 1,
                        segments: None,
                        status: None,
                        started_at: None,
                        ended_at: None,
                    },
                    MessageSnapshot {
                        id: "m2".to_string(),
                        role: "user".to_string(),
                        content: Some("skip me".to_string()),
                        attachments: None,
                        mode: None,
                        slash_command_name: Some("btw".to_string()),
                        context_policy: Some("exclude".to_string()),
                        model: None,
                        created_at: 2,
                        segments: None,
                        status: None,
                        started_at: None,
                        ended_at: None,
                    },
                ],
                pinned: None,
                archived: None,
                has_unread_completed: None,
                task_dock_minimized: None,
                append_dock_minimized: None,
                parent_id: None,
                queued_messages: None,
                queue_state: None,
                usage: None,
                token_count: None,
                permission_grants: None,
                subagent_result: None,
                runtime: None,
                error: None,
            },
            "new prompt",
            &[],
        );

        assert_eq!(rebuilt.len(), 1);
        assert_eq!(extract_text_from_blocks(&rebuilt[0].blocks), "keep me");
    }
}

/// Called by the frontend when the user answers an ask_user question.
#[tauri::command]
pub async fn submit_user_answer(tool_id: String, answer: String) -> Result<(), String> {
    ask::resume_ask(&tool_id, answer).await
}

/// Called by the frontend when the user approves or denies a permission request.
#[tauri::command]
pub async fn approve_permission(tool_id: String, approved: bool) -> Result<(), String> {
    permissions::resolve_permission(&tool_id, approved).await
}
