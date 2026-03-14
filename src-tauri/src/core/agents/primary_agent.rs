use crate::core::agents::base_agent::BaseAgent;
use crate::core::capabilities::Capability;

pub struct PrimaryAgent {
    pub base: BaseAgent,
    capabilities: Vec<Box<dyn Capability>>,
}

impl PrimaryAgent {
    pub fn new(base: BaseAgent) -> Self {
        Self {
            base,
            capabilities: vec![],
        }
    }

    pub fn add_capability(&mut self, capability: Box<dyn Capability>) {
        self.base.registry.register_many(capability.get_tools());
        self.capabilities.push(capability);
    }

    pub fn get_capability_prompts(&self, session_id: &str) -> Vec<String> {
        let mut prompts = vec![];
        for cap in &self.capabilities {
            prompts.extend(cap.get_system_prompts(session_id));
        }
        prompts
    }
}

// Add register_many to ToolRegistry
impl crate::core::tool_use::registry::ToolRegistry {
    pub fn register_many(&mut self, tools: Vec<crate::core::tool_use::registry::ToolDefinition>) {
        for tool in tools {
            self.register(tool);
        }
    }
}
