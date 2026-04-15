use super::{BaseTool, ToolExecutionContext, ToolResult};
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
use tokio::time::{sleep, Duration};

fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub struct SubagentTool;

#[derive(Deserialize)]
struct SubagentArgs {
    message: String,
    title: String,
    #[serde(default)]
    system_prompt: Option<String>,
    agent_id: String,
}

#[async_trait]
impl BaseTool for SubagentTool {
    fn name(&self) -> String {
        "spawn_subagent".to_string()
    }

    fn description(&self) -> String {
        "Spawn a subagent with a clean context to achieve a complex subtask. \
         The coordinator is responsible for respecting task dependencies and wave order."
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
                "agent_id": {
                    "type": "string",
                    "description": "The configured agent id to delegate to (for example 'dynamic' or 'coordinate')"
                }
            },
            "required": ["message", "title", "agent_id"]
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
        let current_definition_id = ctx
            .metadata
            .get("agent_id")
            .and_then(|value| value.as_str())
            .unwrap_or("chat");

        let settings = config::load_settings();
        let requested_target_id = args.agent_id.trim();
        if requested_target_id.is_empty() {
            return ToolResult::error("agent_id must be a non-empty agent id");
        }
        let parent_runtime_spec = match config::resolve_runtime_spec(
            &settings,
            config::RuntimeIntent {
                agent_id: Some(current_definition_id.to_string()),
                provider_id: None,
                model_id: None,
                reasoning: None,
                permission_mode: None,
                allowed_tools: None,
                disallowed_tools: None,
            },
        ) {
            Ok(spec) => spec,
            Err(error) => return ToolResult::error(error),
        };

        let allowed_targets = parent_runtime_spec
            .delegate_agents
            .iter()
            .map(|agent| agent.id.to_ascii_lowercase())
            .collect::<Vec<_>>();
        if !allowed_targets
            .iter()
            .any(|allowed| allowed.eq_ignore_ascii_case(requested_target_id))
        {
            return ToolResult::error(format!(
                "Agent '{}' may not delegate to '{}'",
                current_definition_id, requested_target_id
            ));
        }

        if let Some(max_depth) = parent_runtime_spec.agent.execution.max_delegation_depth {
            if current_depth >= max_depth {
                return ToolResult::error(format!(
                    "Delegation depth limit ({max_depth}) reached for '{}'",
                    current_definition_id
                ));
            }
        }

        let agent_def = match resolve_delegation_target(&settings, requested_target_id) {
            Some(target) => target,
            None => {
                return ToolResult::error(format!(
                    "Unknown agent '{}' requested for delegation",
                    requested_target_id
                ))
            }
        };

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
                parent_tool_call_id: ctx.tool_call_id.clone(),
                sub_session_id: sub_session_id.clone(),
                title: args.title.clone(),
                message: args.message.clone(),
                started_at: current_time_millis(),
            },
        );

        let sub_agent_id = agent_registry::register_agent(
            sub_session_id.clone(),
            Some(ctx.agent_id.clone()),
            current_depth + 1,
        );

        event_bus::register_child(&ctx.agent_id, &sub_agent_id);

        session_tree::register_session_child(ctx.session_id.clone(), sub_session_id.clone()).await;

        // Import the engine's run_stream entry point via the engine module.
        // SubagentTool delegates to the new engine::QueryEngine for real execution.
        use crate::engine::query_engine::QueryEngine;
        use crate::hooks::executor::HookExecutor;
        use crate::hooks::loader::load_hook_registry_for_cwd;

        let inherited_provider_id = ctx
            .metadata
            .get("provider_id")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let inherited_model = agent_def
            .model
            .model_id
            .clone()
            .or_else(|| {
                ctx.metadata
                    .get("model")
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
            });
        let inherited_reasoning = ctx
            .metadata
            .get("reasoning")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let runtime_spec = match config::resolve_runtime_spec(
            &settings,
            config::RuntimeIntent {
                agent_id: Some(requested_target_id.to_string()),
                provider_id: inherited_provider_id.clone(),
                model_id: inherited_model.clone(),
                reasoning: inherited_reasoning.clone(),
                permission_mode: agent_def.permissions.default_mode.clone(),
                allowed_tools: Some(agent_def.permissions.allowed_tools.clone())
                    .filter(|tools| !tools.is_empty()),
                disallowed_tools: Some(agent_def.permissions.disallowed_tools.clone())
                    .filter(|tools| !tools.is_empty()),
            },
        ) {
            Ok(config) => config,
            Err(error) => return ToolResult::error(error),
        };
        let client = llm::create_client(&runtime_spec.llm);
        let injected_subagent_prompt = Some(config::render_prompt_fragments(&settings, &agent_def.prompt_refs))
            .filter(|prompt| !prompt.trim().is_empty());
        let merged_additional_prompt = match (injected_subagent_prompt.as_deref(), args.system_prompt.as_deref()) {
            (Some(subagent_prompt), Some(system_prompt)) if !system_prompt.trim().is_empty() => {
                Some(format!("{subagent_prompt}\n\n{system_prompt}"))
            }
            (Some(subagent_prompt), _) => Some(subagent_prompt.to_string()),
            (_, Some(system_prompt)) if !system_prompt.trim().is_empty() => Some(system_prompt.to_string()),
            _ => None,
        };
        let system_prompt = build_runtime_prompt_with_addition(
            &settings,
            &ctx.cwd,
            Some(&args.message),
            merged_additional_prompt.as_deref(),
            &runtime_spec,
        );
        let merged_mcp_configs = McpClientManager::merged_server_configs(&settings, &ctx.cwd);
        let mcp_manager = if merged_mcp_configs.is_empty() {
            None
        } else {
            let mut manager = McpClientManager::new(merged_mcp_configs);
            manager.connect_all().await;
            Some(std::sync::Arc::new(tokio::sync::Mutex::new(manager)))
        };
        let allowed_tools = if runtime_spec.agent.permissions.locked {
            Some(&runtime_spec.permission.allowed_tools[..])
        } else if runtime_spec.permission.allowed_tools.is_empty() {
            None
        } else {
            Some(&runtime_spec.permission.allowed_tools[..])
        };
        let denied_tools = if runtime_spec.permission.denied_tools.is_empty() {
            None
        } else {
            Some(&runtime_spec.permission.denied_tools[..])
        };
        let tool_registry = std::sync::Arc::new(crate::tools::ToolRegistry::create_for_agent(
            mcp_manager.clone(),
            allowed_tools,
            denied_tools,
        ));
        let permission_checker = std::sync::Arc::new(
            crate::permissions::checker::PermissionChecker::new(&runtime_spec.permission),
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
            provider_id: inherited_provider_id.unwrap_or_else(|| runtime_spec.llm.name.clone()),
            model: runtime_spec.llm.model.clone(),
            reasoning: runtime_spec.reasoning.clone(),
            system_prompt,
            agent_turn_limit: agent_def.max_turns.or(runtime_spec.agent_turn_limit),
            definition_id: requested_target_id.to_string(),
            delegation: runtime_spec.delegation.clone(),
            completion: runtime_spec.completion.clone(),
            requires_delegation_for_completion: false,
            agent_id: sub_agent_id.clone(),
            session_id: sub_session_id.clone(),
        };

        let mut engine = QueryEngine::new(context);

        let result: Result<String, crate::shared::error::RhythmError> = tokio::select! {
            result = engine.submit_message(args.message) => result,
            _ = wait_for_subagent_interrupt(&ctx.session_id, &sub_session_id) => {
                let _ = crate::runtime::interrupts::request_interrupt(&sub_session_id).await;
                Err(crate::shared::error::RhythmError::LlmError("Subagent interrupted".to_string()))
            }
        };

        let (result_str, is_error) = match result {
            Ok(text) if !text.is_empty() => (text, false),
            Ok(_) => (format!("Subagent '{}' completed.", args.title), false),
            Err(e) => (format!("Subagent failed: {}", e), true),
        };

        event_bus::emit(
            &sub_agent_id,
            &sub_session_id,
            EventPayload::SubagentEnd {
                parent_session_id: ctx.session_id.clone(),
                parent_tool_call_id: ctx.tool_call_id.clone(),
                sub_session_id: sub_session_id.clone(),
                result: result_str.clone(),
                is_error,
            },
        );

        event_bus::unregister(&sub_agent_id);
        agent_registry::unregister_agent(&sub_agent_id);
        session_tree::unregister_session_child(&ctx.session_id, &sub_session_id).await;

        if is_error {
            ToolResult::error(result_str)
        } else {
            ToolResult::ok(result_str)
        }
    }
}

fn resolve_delegation_target(
    settings: &config::RhythmSettings,
    target_id: &str,
) -> Option<config::AgentDefinitionConfig> {
    config::resolve_subagent_definition(settings, target_id)
}

async fn wait_for_subagent_interrupt(parent_session_id: &str, sub_session_id: &str) {
    loop {
        if crate::runtime::interrupts::is_interrupted(parent_session_id).await
            || crate::runtime::interrupts::is_interrupted(sub_session_id).await
        {
            return;
        }
        sleep(Duration::from_millis(50)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::config::{AgentConfigKind, AgentDefinitionConfig, AgentExecutionConfig, AgentModelConfig, AgentPermissions};

    #[test]
    fn resolve_delegation_target_returns_subagent_agent() {
        let mut settings = config::RhythmSettings::default();
        settings.agents.items.push(AgentDefinitionConfig {
            id: "test_subagent".to_string(),
            label: "Test Subagent".to_string(),
            mode: String::new(),
            description: "test".to_string(),
            kinds: vec![AgentConfigKind::Subagent],
            prompt_refs: vec![],
            model: AgentModelConfig::default(),
            permissions: AgentPermissions::default(),
            execution: AgentExecutionConfig::default(),
            max_turns: None,
        });

        let agent = resolve_delegation_target(&settings, "test_subagent").expect("test_subagent target");

        assert_eq!(agent.id, "test_subagent");
    }

    #[test]
    fn resolve_delegation_target_returns_none_for_unknown_agent() {
        let mut settings = config::RhythmSettings::default();
        settings.agents.items.push(AgentDefinitionConfig {
            id: "dynamic".to_string(),
            label: "Dynamic".to_string(),
            mode: String::new(),
            description: "dynamic".to_string(),
            kinds: vec![AgentConfigKind::Subagent],
            prompt_refs: vec![],
            model: AgentModelConfig::default(),
            permissions: AgentPermissions::default(),
            execution: AgentExecutionConfig::default(),
            max_turns: None,
        });

        assert!(resolve_delegation_target(&settings, "missing").is_none());
    }
}
