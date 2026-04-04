use async_trait::async_trait;
use serde_json::Value;
use tauri::ipc::Channel;
use crate::shared::schema::ServerEventChunk;
use super::AgentTool;

pub struct FileSystemTool;

#[async_trait]
impl AgentTool for FileSystemTool {
    fn name(&self) -> &'static str {
        "file_system"
    }

    fn description(&self) -> &'static str {
        "Reads or writes files."
    }

    async fn execute(&self, _args: Value, _stream: &Channel<ServerEventChunk>) -> Result<String, String> {
        // Stub
        Ok("File operations executed".to_string())
    }
}
