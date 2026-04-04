use async_trait::async_trait;
use serde_json::Value;
use tauri::ipc::Channel;
use crate::shared::schema::ServerEventChunk;

pub mod shell;
pub mod file_system;
pub mod ask;
pub mod subagent;

#[async_trait]
pub trait AgentTool: Send + Sync {
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn parameters(&self) -> Value;
    async fn execute(&self, session_id: &str, tool_call_id: &str, args: Value, stream: &Channel<ServerEventChunk>) -> Result<String, String>;
}
