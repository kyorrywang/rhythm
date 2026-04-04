use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::ipc::Channel;
use crate::shared::schema::ServerEventChunk;
use super::AgentTool;

pub struct FileSystemTool;

#[derive(Deserialize)]
struct FileArgs {
    action: String, // "read", "write", "list"
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

    async fn execute(&self, args: Value, _stream: &Channel<ServerEventChunk>) -> Result<String, String> {
        let args: FileArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;
        let path = PathBuf::from(args.path);

        match args.action.as_str() {
            "read" => {
                fs::read_to_string(path).map_err(|e| e.to_string())
            },
            "write" => {
                if let Some(content) = args.content {
                    if let Some(parent) = path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    fs::write(path, content).map_err(|e| e.to_string())?;
                    Ok("Success: file written".to_string())
                } else {
                    Err("Content is required for write".to_string())
                }
            },
            "list" => {
                let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
                let list = entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect::<Vec<String>>()
                    .join("\n");
                Ok(list)
            },
            _ => Err("Invalid action".to_string()),
        }
    }
}
