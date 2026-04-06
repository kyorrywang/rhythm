use std::path::PathBuf;
use std::sync::Arc;
use tauri::ipc::Channel;

use crate::shared::schema::{ServerEventChunk, EventPayload};
use crate::engine::{QueryContext, QueryEngine};
use crate::infrastructure::config;
use crate::infrastructure::event_bus;
use crate::tools::ToolRegistry;
use crate::permissions::PermissionChecker;
use crate::hooks::loader::load_hook_registry_for_cwd;
use crate::hooks::executor::HookExecutor;
use crate::mcp::McpClientManager;
use crate::llm;
use crate::prompts::builder::build_runtime_prompt;
use crate::runtime::{ask, permissions, session_tree, sessions};
use crate::swarm::agent_registry;
use tokio::sync::Mutex;

/// Primary streaming entry point.  Builds the full QueryContext and runs the engine.
#[tauri::command]
pub async fn chat_stream(
    session_id: String,
    prompt: String,
    cwd: Option<String>,
    on_event: Channel<ServerEventChunk>,
) -> Result<(), String> {
    let agent_id = agent_registry::register_agent(session_id.clone(), None, 0);
    event_bus::register_ipc_channel(&agent_id, on_event.clone());
    sessions::register_session(session_id.clone());

    tokio::spawn(async move {
        let settings = config::load_settings();
        let client = Arc::from(llm::create_client(&settings.llm));

        let cwd_path = cwd
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

        // Build multi-layer system prompt
        let system_prompt = build_runtime_prompt(&settings, &cwd_path, Some(&prompt));

        let merged_mcp_configs = McpClientManager::merged_server_configs(&settings, &cwd_path);
        let mcp_manager = if merged_mcp_configs.is_empty() {
            None
        } else {
            let mut manager = McpClientManager::new(merged_mcp_configs);
            manager.connect_all().await;
            Some(Arc::new(Mutex::new(manager)))
        };

        let tool_registry = Arc::new(ToolRegistry::create_with_mcp(mcp_manager.clone()));
        let permission_checker = Arc::new(PermissionChecker::new(&settings.permission));

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
            system_prompt,
            max_turns: settings.max_turns,
            auto_compact_enabled: settings.auto_compact.enabled,
            max_tokens: settings.llm.max_tokens.unwrap_or(16384),
            auto_compact_threshold_ratio: settings.auto_compact.threshold_ratio,
            max_micro_compacts: settings.auto_compact.max_micro_compacts,
            agent_id: agent_id.clone(),
            session_id: session_id.clone(),
        };

        let mut engine = QueryEngine::new(context);

        if let Err(e) = engine.submit_message(prompt).await {
            eprintln!("Generation error: {}", e);
            event_bus::emit(&agent_id, &session_id, EventPayload::TextDelta {
                content: format!("\n[Error: {}]", e),
            });
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
