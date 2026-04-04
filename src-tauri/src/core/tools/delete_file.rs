use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use crate::shared::schema::EventPayload;
use crate::core::event_bus;
use super::AgentTool;

pub struct DeleteFileTool;

#[derive(Deserialize)]
struct DeleteFileArgs {
    path: String,
}

#[async_trait]
impl AgentTool for DeleteFileTool {
    fn name(&self) -> &'static str {
        "delete"
    }

    fn description(&self) -> &'static str {
        "Delete a file. This action cannot be undone."
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to delete"
                }
            },
            "required": ["path"]
        })
    }

    async fn execute(&self, agent_id: &str, session_id: &str, tool_call_id: &str, args: Value) -> Result<String, String> {
        let args: DeleteFileArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;
        let path = PathBuf::from(&args.path);

        fs::remove_file(&path).map_err(|e| e.to_string())?;
        event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
            tool_id: tool_call_id.to_string(),
            log_line: format!("Deleted {}", path.display()),
        });
        Ok(format!("Success: {} deleted", path.display()))
    }
}
