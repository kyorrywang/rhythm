use anyhow::Result;
use crate::core::llm_client::LLMClient;
use crate::core::models::{ChatMessage, ToolResult};
use crate::core::tool_use::registry::ToolRegistry;

pub struct BaseAgent {
    pub llm: LLMClient,
    pub registry: ToolRegistry,
}

impl BaseAgent {
    pub fn new(llm: LLMClient) -> Self {
        Self {
            llm,
            registry: ToolRegistry::new(),
        }
    }

    pub async fn run_step(&self, history: &[ChatMessage]) -> Result<(ChatMessage, Vec<ToolResult>)> {
        let schemas = self.registry.get_all_schemas();
        let (content, tool_calls) = self.llm.decide(history, Some(schemas)).await?;

        let mut assistant_msg = ChatMessage::new("assistant", content);
        let mut results = vec![];

        if !tool_calls.is_empty() {
            // Mapping back to the intermediate JSON format for UI/Store
            let calls_json: Vec<serde_json::Value> = tool_calls.iter().map(|c| {
                serde_json::json!({
                    "id": c.id,
                    "type": "function",
                    "function": {
                        "name": c.name,
                        "arguments": serde_json::to_string(&c.arguments).unwrap_or_default()
                    }
                })
            }).collect();
            assistant_msg.tool_calls = Some(calls_json);

            for call in tool_calls {
                let res = if let Some(tool) = self.registry.get(&call.name) {
                    match (tool.handler)(call.arguments) {
                        Ok(output) => ToolResult { id: call.id, name: call.name, ok: true, output },
                        Err(e) => ToolResult { id: call.id, name: call.name, ok: false, output: serde_json::json!(e.to_string()) },
                    }
                } else {
                    let name = call.name.clone();
                    ToolResult { id: call.id, name, ok: false, output: serde_json::json!(format!("Tool not found: {}", call.name)) }
                };
                results.push(res);
            }
        }

        Ok((assistant_msg, results))
    }
}
