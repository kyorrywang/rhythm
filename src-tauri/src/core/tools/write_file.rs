use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use crate::shared::schema::EventPayload;
use crate::core::event_bus;
use super::AgentTool;

pub struct WriteFileTool;

#[derive(Deserialize)]
struct WriteFileArgs {
    path: String,
    content: String,
}

#[async_trait]
impl AgentTool for WriteFileTool {
    fn name(&self) -> &'static str {
        "write"
    }

    fn description(&self) -> &'static str {
        "Create a new file or overwrite an existing file with the given content. \
         Parent directories will be created automatically if they don't exist."
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to write"
                },
                "content": {
                    "type": "string",
                    "description": "The content to write to the file"
                }
            },
            "required": ["path", "content"]
        })
    }

    async fn execute(&self, agent_id: &str, session_id: &str, tool_call_id: &str, args: Value) -> Result<String, String> {
        let args: WriteFileArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;
        let path = PathBuf::from(&args.path);

        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&path, &args.content).map_err(|e| e.to_string())?;
        event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
            tool_id: tool_call_id.to_string(),
            log_line: format!("{} bytes written", args.content.len()),
        });
        Ok(format!("Success: {} bytes written", args.content.len()))
    }
}
