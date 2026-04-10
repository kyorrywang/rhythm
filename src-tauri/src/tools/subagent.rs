use super::{BaseTool, ToolExecutionContext, ToolResult};
use crate::coordinator::get_builtin_agent;
use crate::infrastructure::config;
use crate::infrastructure::event_bus;
use crate::llm;
use crate::mcp::McpClientManager;
use crate::prompts::build_runtime_prompt_with_addition;
use crate::runtime::session_tree;
use crate::shared::schema::EventPayload;
use crate::swarm::agent_registry;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

pub struct SubagentTool;

#[derive(Deserialize)]
struct SubagentArgs {
    message: String,
    title: String,
    #[serde(default)]
    system_prompt: Option<String>,
    #[serde(default)]
    subagent_type: Option<String>,
}

#[async_trait]
impl BaseTool for SubagentTool {
    fn name(&self) -> String {
        "spawn_subagent".to_string()
    }

    fn description(&self) -> String {
        "Spawn a subagent with a clean context to achieve a complex subtask. \
         The subagent has access to all tools but no parent conversation history."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The task description or prompt for the subagent"
                },
                "title": {
                    "type": "string",
                    "description": "A short label for this subagent task (shown in UI)"
                },
                "system_prompt": {
                    "type": "string",
                    "description": "Optional custom system prompt for the subagent"
                },
                "subagent_type": {
                    "type": "string",
                    "description": "Optional built-in agent type (e.g. 'general-purpose', 'explorer', 'worker', 'verifier')"
                }
            },
            "required": ["message", "title"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: SubagentArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        let current_depth = agent_registry::get_agent_depth(&ctx.agent_id).unwrap_or(0);
        if current_depth >= 1 {
            return ToolResult::error("Nested subagent spawning is currently disabled");
        }

        let sub_session_id = format!(
            "{}-sub-{}",
            ctx.session_id,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        );

        event_bus::emit(
            &ctx.agent_id,
            &ctx.session_id,
            EventPayload::SubagentStart {
                parent_session_id: ctx.session_id.clone(),
                sub_session_id: sub_session_id.clone(),
                title: args.title.clone(),
                message: args.message.clone(),
            },
        );

        let sub_agent_id =
            agent_registry::register_agent(sub_session_id.clone(), Some(ctx.agent_id.clone()), 1);

        event_bus::register_child(&ctx.agent_id, &sub_agent_id);

        session_tree::register_session_child(ctx.session_id.clone(), sub_session_id.clone()).await;

        // Import the engine's run_stream entry point via the engine module.
        // SubagentTool delegates to the new engine::QueryEngine for real execution.
        use crate::engine::query_engine::QueryEngine;
        use crate::hooks::executor::HookExecutor;
        use crate::hooks::loader::load_hook_registry_for_cwd;

        let settings = config::load_settings();
        let client = llm::create_client(&settings.llm);
        let agent_def = args.subagent_type.as_deref().and_then(get_builtin_agent);
        let system_prompt = build_runtime_prompt_with_addition(
            &settings,
            &ctx.cwd,
            Some(&args.message),
            args.system_prompt.as_deref(),
            false,
        );
        let merged_mcp_configs = McpClientManager::merged_server_configs(&settings, &ctx.cwd);
        let mcp_manager = if merged_mcp_configs.is_empty() {
            None
        } else {
            let mut manager = McpClientManager::new(merged_mcp_configs);
            manager.connect_all().await;
            Some(std::sync::Arc::new(tokio::sync::Mutex::new(manager)))
        };
        let tool_registry = std::sync::Arc::new(crate::tools::ToolRegistry::create_for_agent(
            mcp_manager.clone(),
            agent_def.as_ref().and_then(|a| a.tools.as_deref()),
            agent_def
                .as_ref()
                .and_then(|a| a.disallowed_tools.as_deref()),
        ));
        let permission_checker = std::sync::Arc::new(
            crate::permissions::checker::PermissionChecker::new_with_mode(
                &settings.permission,
                agent_def.as_ref().and_then(|a| a.permission_mode.clone()),
            ),
        );

        let hook_executor = load_hook_registry_for_cwd(&settings, &ctx.cwd);
        let hook_executor = std::sync::Arc::new(HookExecutor::new(hook_executor));

        let context = crate::engine::context::QueryContext {
            api_client: std::sync::Arc::from(client),
            tool_registry: tool_registry.clone(),
            permission_checker,
            hook_executor: Some(hook_executor),
            mcp_manager,
            cwd: ctx.cwd.clone(),
            model: agent_def
                .as_ref()
                .and_then(|a| a.model.clone())
                .unwrap_or_else(|| settings.llm.model.clone()),
            reasoning: None,
            system_prompt,
            agent_turn_limit: agent_def
                .as_ref()
                .and_then(|a| a.max_turns)
                .or(settings.agent_turn_limit),
            agent_id: sub_agent_id.clone(),
            session_id: sub_session_id.clone(),
        };

        let mut engine = QueryEngine::new(context);

        let result = engine.submit_message(args.message).await;

        let (result_str, is_error) = match result {
            Ok(text) if !text.is_empty() => (text, false),
            Ok(_) => (format!("Subagent '{}' completed.", args.title), false),
            Err(e) => (format!("Subagent failed: {}", e), true),
        };

        event_bus::emit(
            &sub_agent_id,
            &sub_session_id,
            EventPayload::SubagentEnd {
                sub_session_id: sub_session_id.clone(),
                result: result_str.clone(),
                is_error,
            },
        );

        event_bus::unregister(&sub_agent_id);
        agent_registry::unregister_agent(&sub_agent_id);

        if is_error {
            ToolResult::error(result_str)
        } else {
            ToolResult::ok(result_str)
        }
    }
}
