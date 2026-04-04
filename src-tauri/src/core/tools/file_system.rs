use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use crate::shared::schema::EventPayload;
use crate::core::event_bus;
use super::AgentTool;

pub struct FileSystemTool;

#[derive(Deserialize)]
struct FileArgs {
    action: String,
    path: String,
    content: Option<String>,
}

#[async_trait]
impl AgentTool for FileSystemTool {
    fn name(&self) -> &'static str {
        "file_system"
    }

    fn description(&self) -> &'static str {
        "Perform file system operations: read, write, or list files. \
         Arguments: { \"action\": \"read\"|\"write\"|\"list\", \"path\": \"string\", \"content\": \"string (optional for write)\" }"
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["read", "write", "list"],
                    "description": "The action to perform: read, write, or list"
                },
                "path": {
                    "type": "string",
                    "description": "The file or directory path"
                },
                "content": {
                    "type": "string",
                    "description": "Content to write (required for write action)"
                }
            },
            "required": ["action", "path"]
        })
    }

    async fn execute(&self, agent_id: &str, session_id: &str, tool_call_id: &str, args: Value) -> Result<String, String> {
        let args: FileArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;
        let path = PathBuf::from(args.path);

        match args.action.as_str() {
            "read" => {
                let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
                event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
                    tool_id: tool_call_id.to_string(),
                    log_line: format!("Reading {}\n\n{}", path.display(), content),
                });
                Ok(content)
            },
            "write" => {
                if let Some(content) = args.content {
                    if let Some(parent) = path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    fs::write(&path, &content).map_err(|e| e.to_string())?;
                    event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
                        tool_id: tool_call_id.to_string(),
                        log_line: format!("Writing {}\n\n{}", path.display(), content),
                    });
                    Ok("Success: file written".to_string())
                } else {
                    Err("Content is required for write".to_string())
                }
            },
            "list" => {
                let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
                let list = entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect::<Vec<String>>()
                    .join("\n");
                event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
                    tool_id: tool_call_id.to_string(),
                    log_line: format!("Listing {}\n\n{}", path.display(), list),
                });
                Ok(list)
            },
            _ => Err("Invalid action".to_string()),
        }
    }
}
