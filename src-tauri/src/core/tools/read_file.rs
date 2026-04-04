use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use crate::shared::schema::EventPayload;
use crate::core::event_bus;
use super::AgentTool;

pub struct ReadFileTool;

#[derive(Deserialize)]
struct ReadFileArgs {
    path: String,
}

#[async_trait]
impl AgentTool for ReadFileTool {
    fn name(&self) -> &'static str {
        "read"
    }

    fn description(&self) -> &'static str {
        "Read the contents of a file and return them as a string."
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to read"
                }
            },
            "required": ["path"]
        })
    }

    async fn execute(&self, agent_id: &str, session_id: &str, tool_call_id: &str, args: Value) -> Result<String, String> {
        let args: ReadFileArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;
        let path = PathBuf::from(&args.path);

        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
            tool_id: tool_call_id.to_string(),
            log_line: content.clone(),
        });
        Ok(content)
    }
}
