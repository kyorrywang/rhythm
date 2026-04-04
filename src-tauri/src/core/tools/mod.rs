use async_trait::async_trait;
use serde_json::Value;

pub mod shell;
pub mod file_system;
pub mod ask;
pub mod subagent;
pub mod plan;

#[async_trait]
pub trait AgentTool: Send + Sync {
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn parameters(&self) -> Value;
    async fn execute(&self, agent_id: &str, session_id: &str, tool_call_id: &str, args: Value) -> Result<String, String>;
}
