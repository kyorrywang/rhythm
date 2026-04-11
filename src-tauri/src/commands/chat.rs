use std::sync::Arc;
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

const CHAT_AUTO_RETRY_DELAY_MS: u64 = 10_000;

fn runtime_state_message(state: &str, attempt: u32, retry_in_seconds: Option<u32>) -> String {
    match state {
        "starting" => "正在启动会话流。".to_string(),
        "streaming" => "正在流式生成。".to_string(),
        "backoff_waiting" => format!(
            "429 Too Many Requests，第 {} 次自动重试将在 {} 秒后开始。",
            attempt.max(1),
            retry_in_seconds.unwrap_or((CHAT_AUTO_RETRY_DELAY_MS / 1000) as u32)
        ),
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
    profile_id: Option<String>,
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
            profile_id: profile_id.clone(),
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
            if runtime_spec.permission.allowed_tools.is_empty() {
                None
            } else {
                Some(&runtime_spec.permission.allowed_tools)
            },
            if runtime_spec.permission.denied_tools.is_empty() {
                None
            } else {
                Some(&runtime_spec.permission.denied_tools)
            },
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
                delegation: runtime_spec.delegation.clone(),
                completion: runtime_spec.completion.clone(),
                requires_delegation_for_completion,
                agent_id: agent_id.clone(),
                session_id: session_id.clone(),
            };

            let mut engine = QueryEngine::new(context);
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
                Err(e) if is_retryable_rate_limit_error(&e.to_string()) => {
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
                        CHAT_AUTO_RETRY_DELAY_MS, e
                    );
                    if wait_for_retry_or_interrupt(&agent_id, &session_id, retry_attempt, retry_at).await {
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
                Err(e) => {
                    eprintln!("Generation error: {}", e);
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
                            content: format!("\n[Error: {}]", e),
                        },
                    );
                    event_bus::emit(&agent_id, &session_id, EventPayload::Failed);
                    break;
                }
            }
        }

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
            message: runtime_state_message(state, normalized_attempt, retry_in_seconds),
            attempt: normalized_attempt,
            retry_in_seconds,
            retry_at,
        },
    );
}

async fn wait_for_retry_or_interrupt(agent_id: &str, session_id: &str, attempt: u32, retry_at: u64) -> bool {
    let mut remaining_ms = CHAT_AUTO_RETRY_DELAY_MS;
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
                Some("rate_limit"),
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

fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
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
