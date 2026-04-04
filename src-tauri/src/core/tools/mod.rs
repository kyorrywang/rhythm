use async_trait::async_trait;
use serde_json::Value;
use tauri::ipc::Channel;
use crate::shared::schema::ServerEventChunk;

pub mod shell;
pub mod file_system;

#[async_trait]
pub trait AgentTool: Send + Sync {
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    async fn execute(&self, args: Value, stream: &Channel<ServerEventChunk>) -> Result<String, String>;
}
