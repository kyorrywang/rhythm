use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

use crate::shared::schema::EventPayload;
use crate::core::event_bus;
use crate::core::agent_registry;
use crate::core::agent_loop::AgentLoop;
use crate::core::models;
use crate::core::state;
use crate::infrastructure::config;

use super::AgentTool;

pub struct SubagentTool;

#[derive(Deserialize)]
struct SubagentArgs {
    message: String,
    title: String,
    #[serde(default)]
    system_prompt: Option<String>,
}

#[async_trait]
impl AgentTool for SubagentTool {
    fn name(&self) -> &'static str {
        "spawn_subagent"
    }

    fn description(&self) -> &'static str {
        "Spawn a subagent to achieve a complex task. The subagent has a clean context (no parent conversation history). \
         Arguments: { \"message\": \"string\", \"title\": \"string (short label)\", \"system_prompt\": \"string (optional)\" }"
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The task description or message to send to the subagent"
                },
                "title": {
                    "type": "string",
                    "description": "A short title or label for this subagent task (shown in UI)"
                },
                "system_prompt": {
                    "type": "string",
                    "description": "Optional custom system prompt for the subagent"
                }
            },
            "required": ["message", "title"]
        })
    }

    async fn execute(&self, agent_id: &str, session_id: &str, _tool_call_id: &str, args: Value) -> Result<String, String> {
        let args: SubagentArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;

        let current_depth = agent_registry::get_agent_depth(agent_id).unwrap_or(0);
        if current_depth >= 1 {
            return Err("Nested subagent spawning is currently disabled".to_string());
        }

        let sub_session_id = format!(
            "{}-sub-{}",
            session_id,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        );

        let display_title = args.title.clone();

        event_bus::emit(
            agent_id,
            session_id,
            EventPayload::SubagentStart {
                parent_session_id: session_id.to_string(),
                sub_session_id: sub_session_id.clone(),
                title: display_title.clone(),
            },
        );

        let sub_agent_id = agent_registry::register_agent(
            sub_session_id.clone(),
            Some(agent_id.to_string()),
            1,
        );

        // Register parent-child relationship in event_bus so all sub-agent events
        // automatically bubble up to the parent's IPC channel via the child_parent chain.
        // This replaces the old manual forward_task approach and avoids double-sending.
        event_bus::register_child(agent_id, &sub_agent_id);

        state::register_session_child(session_id.to_string(), sub_session_id.clone()).await;

        let settings = config::load_settings();
        let client = models::create_client(&settings.llm);
        let agent = AgentLoop::new(client);

        let result = agent
            .run_stream(
                &sub_agent_id,
                sub_session_id.clone(),
                args.message,
                args.system_prompt,
            )
            .await;

        let (result_str, is_error) = match result {
            Ok(_) => ("Subagent completed successfully".to_string(), false),
            Err(e) => (format!("Subagent failed: {}", e), true),
        };

        // Emit SubagentEnd via sub_agent_id — it will bubble up through child_parent
        // to the parent's IPC channel. unregister happens AFTER this emit.
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
            Err(result_str)
        } else {
            Ok(result_str)
        }
    }
}
