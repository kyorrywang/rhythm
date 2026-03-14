pub mod workflow;

use crate::core::tool_use::registry::ToolDefinition;

pub trait Capability: Send + Sync {
    fn get_tools(&self) -> Vec<ToolDefinition>;
    fn get_system_prompts(&self, session_id: &str) -> Vec<String>;
}
