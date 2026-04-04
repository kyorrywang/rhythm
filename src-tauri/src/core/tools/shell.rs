use async_trait::async_trait;
use serde_json::Value;
use tauri::ipc::Channel;
use crate::shared::schema::ServerEventChunk;
use super::AgentTool;

pub struct ShellTool;

#[async_trait]
impl AgentTool for ShellTool {
    fn name(&self) -> &'static str {
        "shell"
    }

    fn description(&self) -> &'static str {
        "Executes a shell command."
    }

    async fn execute(&self, _args: Value, _stream: &Channel<ServerEventChunk>) -> Result<String, String> {
        // Stub
        Ok("Shell executed".to_string())
    }
}
