use std::sync::Arc;
use tauri::ipc::Channel;

use crate::engine::{QueryContext, QueryEngine};
use crate::hooks::executor::HookExecutor;
use crate::hooks::loader::load_hook_registry_for_cwd;
use crate::infrastructure::config;
use crate::infrastructure::event_bus;
use crate::llm;
use crate::llm::ChatAttachment;
use crate::mcp::McpClientManager;
use crate::permissions::{PermissionChecker, PermissionMode};
use crate::prompts::builder::build_runtime_prompt;
use crate::runtime::{ask, permissions, session_tree, sessions};
use crate::shared::schema::{EventPayload, ServerEventChunk};
use crate::swarm::agent_registry;
use crate::tools::ToolRegistry;
use tokio::sync::Mutex;

/// Primary streaming entry point.  Builds the full QueryContext and runs the engine.
#[tauri::command]
pub async fn chat_stream(
    session_id: String,
    prompt: String,
    attachments: Option<Vec<ChatAttachment>>,
    cwd: Option<String>,
    permission_mode: Option<String>,
    provider_id: Option<String>,
    model: Option<String>,
    reasoning: Option<String>,
    mode: Option<String>,
    on_event: Channel<ServerEventChunk>,
) -> Result<(), String> {
    let mut settings = config::load_settings();
    if let Some(provider_id) = provider_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if provider_id != settings.llm.name {
            return Err(format!(
                "Provider '{}' is not available in the active backend config '{}'",
                provider_id, settings.llm.name
            ));
        }
    }
    if let Some(model) = model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        settings.llm.model = model.to_string();
    }

    let agent_id = agent_registry::register_agent(session_id.clone(), None, 0);
    event_bus::register_ipc_channel(&agent_id, on_event.clone());
    sessions::register_session(session_id.clone());
    let cwd_path = crate::commands::workspace::resolve_workspace_path(cwd.as_deref())?;

    tokio::spawn(async move {
        let client = Arc::from(llm::create_client(&settings.llm));

        // Build multi-layer system prompt
        let coordinate_mode = mode
            .as_deref()
            .map(str::trim)
            .map(|value| value.eq_ignore_ascii_case("coordinate"))
            .unwrap_or(false);
        let system_prompt =
            build_runtime_prompt(&settings, &cwd_path, Some(&prompt), coordinate_mode);

        let merged_mcp_configs = McpClientManager::merged_server_configs(&settings, &cwd_path);
        let mcp_manager = if merged_mcp_configs.is_empty() {
            None
        } else {
            let mut manager = McpClientManager::new(merged_mcp_configs);
            manager.connect_all().await;
            Some(Arc::new(Mutex::new(manager)))
        };

        let tool_registry = Arc::new(ToolRegistry::create_with_mcp(mcp_manager.clone()));
        let permission_mode_override = permission_mode.as_deref().map(PermissionMode::from_str);
        let permission_checker = Arc::new(PermissionChecker::new_with_mode(
            &settings.permission,
            permission_mode_override,
        ));

        let hook_executor = load_hook_registry_for_cwd(&settings, &cwd_path);
        let hook_executor = Arc::new(HookExecutor::new(hook_executor));

        let context = QueryContext {
            api_client: client,
            tool_registry,
            permission_checker,
            hook_executor: Some(hook_executor),
            mcp_manager,
            cwd: cwd_path,
            model: settings.llm.model.clone(),
            reasoning,
            system_prompt,
            agent_turn_limit: settings.agent_turn_limit,
            auto_compact_enabled: settings.auto_compact.enabled,
            max_tokens: settings.llm.max_tokens.unwrap_or(16384),
            auto_compact_threshold_ratio: settings.auto_compact.threshold_ratio,
            max_micro_compacts: settings.auto_compact.max_micro_compacts,
            agent_id: agent_id.clone(),
            session_id: session_id.clone(),
        };

        let mut engine = QueryEngine::new(context);

        if let Err(e) = engine
            .submit_message_with_attachments(prompt, attachments.unwrap_or_default())
            .await
        {
            eprintln!("Generation error: {}", e);
            event_bus::emit(
                &agent_id,
                &session_id,
                EventPayload::TextDelta {
                    content: format!("\n[Error: {}]", e),
                },
            );
            event_bus::emit(&agent_id, &session_id, EventPayload::Done);
        }

        event_bus::unregister(&agent_id);
        agent_registry::unregister_agent(&agent_id);
        session_tree::unregister_session_tree(&session_id).await;
        sessions::unregister_session(session_id);
    });

    Ok(())
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
