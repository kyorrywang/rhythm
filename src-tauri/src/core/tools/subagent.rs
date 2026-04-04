use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use tauri::ipc::Channel;
use crate::shared::schema::ServerEventChunk;
use super::AgentTool;
use crate::core::agent_loop::AgentLoop;
use crate::core::models;
use crate::infrastructure::config;

pub struct SubagentTool;

#[derive(Deserialize)]
struct SubagentArgs {
    goal: String,
}

#[async_trait]
impl AgentTool for SubagentTool {
    fn name(&self) -> &'static str {
        "spawn_subagent"
    }

    fn description(&self) -> &'static str {
        "Spawn a subagent to achieve a complex goal. The subagent has access to the same tools. Arguments: { \"goal\": \"string\" }"
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "goal": {
                    "type": "string",
                    "description": "The goal or task description for the subagent"
                }
            },
            "required": ["goal"]
        })
    }

    async fn execute(&self, session_id: &str, _tool_call_id: &str, args: Value, stream: &Channel<ServerEventChunk>) -> Result<String, String> {
        let args: SubagentArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;

        let sub_session_id = format!("{}-sub-{}", session_id, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
        
        let _ = stream.send(ServerEventChunk::SubagentStart {
            parent_session_id: session_id.to_string(),
            sub_session_id: sub_session_id.clone(),
            title: format!("Subagent: {}", args.goal.chars().take(20).collect::<String>()),
        });

        // Instantiate new agent loop
        let settings = config::load_settings();
        let client = models::create_client(&settings.llm);
        let agent = AgentLoop::new(client);

        let stream_clone = stream.clone();

        match agent.run_stream(sub_session_id, args.goal, stream_clone).await {
            Ok(_) => Ok("Subagent completed successfully".to_string()),
            Err(e) => Err(format!("Subagent failed: {}", e)),
        }
    }
}
