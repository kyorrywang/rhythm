use std::collections::HashMap;
use serde_json::{Value, json};
use anyhow::Result;
use std::sync::Arc;

pub type ToolHandler = Arc<dyn Fn(Value) -> Result<Value> + Send + Sync>;

#[derive(Clone)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
    pub handler: ToolHandler,
}

#[derive(Default, Clone)]
pub struct ToolRegistry {
    tools: HashMap<String, ToolDefinition>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, definition: ToolDefinition) {
        self.tools.insert(definition.name.clone(), definition);
    }

    pub fn get(&self, name: &str) -> Option<&ToolDefinition> {
        self.tools.get(name)
    }

    pub fn get_all_schemas(&self) -> Vec<Value> {
        self.tools.values().map(|t| {
            json!({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                }
            })
        }).collect()
    }
}
