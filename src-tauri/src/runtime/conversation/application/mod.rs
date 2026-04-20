use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::ipc::Channel;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

use crate::infra::config;
use crate::infra::event_bus;
use crate::infra::llm;
use crate::infra::llm::{ChatAttachment, LlmClient};
use crate::runtime::agents::swarm::agent_registry;
use crate::runtime::capabilities::mcp::McpClientManager;
use crate::runtime::capabilities::tools::ToolRegistry;
use crate::runtime::context::prompts::builder::build_runtime_prompt;
use crate::runtime::context::workspace::application::resolve_workspace_path;
use crate::runtime::conversation::engine::{QueryContext, QueryEngine};
use crate::runtime::conversation::interrupts;
use crate::runtime::conversation::session::{history, session_tree, sessions};
use crate::runtime::policy::hooks::executor::HookExecutor;
use crate::runtime::policy::hooks::loader::load_hook_registry_for_cwd;
use crate::runtime::policy::permissions::PermissionChecker;
use crate::shared::schema::{EventPayload, ServerEventChunk};

mod retry;
mod status;

const CHAT_AUTO_RETRY_DELAY_MS: u64 = 10_000;
const CHAT_TRANSIENT_RETRY_DELAY_MS: u64 = 2_000;
const CHAT_MAX_TRANSIENT_RETRIES: u32 = 2;

fn effective_allowed_tools(runtime_spec: &config::ResolvedAgentSpec) -> Option<&[String]> {
    if runtime_spec.agent.permissions.locked {
        return Some(&runtime_spec.permission.allowed_tools);
    }
    if runtime_spec.permission.allowed_tools.is_empty() {
        None
    } else {
        Some(&runtime_spec.permission.allowed_tools)
    }
}

fn effective_disallowed_tools(runtime_spec: &config::ResolvedAgentSpec) -> Option<&[String]> {
    if runtime_spec.permission.denied_tools.is_empty() {
        None
    } else {
        Some(&runtime_spec.permission.denied_tools)
    }
}

/// Primary streaming entry point.  Builds the full QueryContext and runs the engine.
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
    slash_command_name: Option<String>,
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
            permission_mode: permission_mode
                .as_deref()
                .map(crate::runtime::policy::permissions::modes::PermissionMode::from_str),
            allowed_tools: allowed_tools.clone(),
            disallowed_tools: disallowed_tools.clone(),
        },
    )?;
    let llm_config = runtime_spec.llm.clone();

    let agent_id = agent_registry::register_agent(session_id.clone(), None, 0);
    event_bus::register_ipc_channel(&agent_id, on_event.clone());
    sessions::register_session(session_id.clone(), agent_id.clone()).await;
    let cwd_path = resolve_workspace_path(cwd.as_deref())?;
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
                event_bus::emit(
                    &heartbeat_agent_id,
                    &heartbeat_session_id,
                    EventPayload::Heartbeat,
                );
            }
        });

        let client: Arc<dyn LlmClient> = Arc::from(llm::create_client(&llm_config));

        // Build multi-layer system prompt
        let system_prompt =
            build_runtime_prompt(&settings, &cwd_path, Some(&prompt), &runtime_spec);

        let merged_mcp_configs = McpClientManager::merged_server_configs(&settings, &cwd_path);
        let mcp_manager = if merged_mcp_configs.is_empty() {
            None
        } else {
            let mut manager = McpClientManager::new(merged_mcp_configs);
            manager.connect_all().await;
            Some(Arc::new(Mutex::new(manager)))
        };

        let loaded_plugins = crate::runtime::extensions::load_plugins(&settings, &cwd_path);
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
        let prepared_prompt = match slash_command_name
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            Some(command_name) => {
                let descriptor =
                    match crate::runtime::capabilities::slash::registry::resolve_slash_command(
                        &cwd_path,
                        command_name,
                    ) {
                        Ok(Some(descriptor)) => descriptor,
                        Ok(None) => {
                            emit_runtime_status(
                                &agent_id,
                                &session_id,
                                "failed",
                                Some("error"),
                                None,
                                None,
                                None,
                            );
                            event_bus::emit(&agent_id, &session_id, EventPayload::Failed);
                            return;
                        }
                        Err(error) => {
                            eprintln!("Failed to resolve slash command: {}", error);
                            emit_runtime_status(
                                &agent_id,
                                &session_id,
                                "failed",
                                Some("error"),
                                None,
                                None,
                                None,
                            );
                            event_bus::emit(&agent_id, &session_id, EventPayload::Failed);
                            return;
                        }
                    };
                match crate::runtime::capabilities::slash::router::execute_slash_command(
                    &descriptor,
                    &prompt,
                    &crate::runtime::capabilities::slash::types::SlashRuntimeExecutionContext {
                        cwd: cwd_path.to_string_lossy().to_string(),
                        session_id: session_id.clone(),
                        agent_id: agent_id.clone(),
                        definition_id: runtime_spec.agent.id.clone(),
                        provider_id: provider_id
                            .as_deref()
                            .unwrap_or(&llm_config.name)
                            .to_string(),
                        model: llm_config.model.clone(),
                        reasoning: runtime_spec
                            .reasoning
                            .clone()
                            .unwrap_or_else(|| "medium".to_string()),
                    },
                )
                .await
                {
                    Ok(crate::runtime::capabilities::slash::router::SlashExecutionOutcome::ContinueWithPrompt(
                        prompt,
                    )) => prompt,
                    Ok(crate::runtime::capabilities::slash::router::SlashExecutionOutcome::Handled) => {
                        emit_runtime_status(
                            &agent_id,
                            &session_id,
                            "completed",
                            Some("completed"),
                            Some(0),
                            None,
                            None,
                        );
                        event_bus::emit(&agent_id, &session_id, EventPayload::Done);
                        return;
                    }
                    Err(error) => {
                        eprintln!("Slash command '{}' failed: {}", command_name, error);
                        emit_runtime_status(
                            &agent_id,
                            &session_id,
                            "failed",
                            Some("error"),
                            None,
                            None,
                            None,
                        );
                        event_bus::emit(&agent_id, &session_id, EventPayload::Failed);
                        return;
                    }
                }
            }
            None => prompt.clone(),
        };

        let requires_delegation_for_completion =
            config::should_delegate_task(&runtime_spec, &prepared_prompt, attachments.len());
        let mut retry_attempt: u32 = 0;
        emit_runtime_status(&agent_id, &session_id, "starting", None, None, None, None);

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
            if let Ok(history) =
                history::load_session_history(&cwd_path, &session_id, &prompt, &attachments).await
            {
                if !history.is_empty() {
                    engine.set_messages(history);
                }
            }
            emit_runtime_status(
                &agent_id,
                &session_id,
                if retry_attempt > 0 {
                    "retrying"
                } else {
                    "streaming"
                },
                None,
                Some(retry_attempt),
                None,
                None,
            );

            match engine
                .submit_message_with_attachments(prepared_prompt.clone(), attachments.clone())
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
                        CHAT_AUTO_RETRY_DELAY_MS,
                        e.message()
                    );
                    if wait_for_retry_or_interrupt(
                        &agent_id,
                        &session_id,
                        retry_attempt,
                        retry_at,
                        Some("rate_limit"),
                        CHAT_AUTO_RETRY_DELAY_MS,
                    )
                    .await
                    {
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
                        CHAT_TRANSIENT_RETRY_DELAY_MS,
                        e.message()
                    );
                    if wait_for_retry_or_interrupt(
                        &agent_id,
                        &session_id,
                        retry_attempt,
                        retry_at,
                        Some("unknown"),
                        CHAT_TRANSIENT_RETRY_DELAY_MS,
                    )
                    .await
                    {
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
    retry::is_retryable_rate_limit_error(message)
}

fn is_retryable_transient_error(message: &str) -> bool {
    retry::is_retryable_transient_error(message)
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
    status::emit_runtime_status(
        agent_id,
        session_id,
        state,
        reason,
        attempt,
        retry_in_seconds,
        retry_at,
        CHAT_AUTO_RETRY_DELAY_MS,
        CHAT_TRANSIENT_RETRY_DELAY_MS,
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
    retry::wait_for_retry_or_interrupt(
        agent_id,
        session_id,
        attempt,
        retry_at,
        reason,
        total_delay_ms,
        CHAT_AUTO_RETRY_DELAY_MS,
        CHAT_TRANSIENT_RETRY_DELAY_MS,
    )
    .await
}

fn current_time_millis() -> u64 {
    status::current_time_millis()
}
