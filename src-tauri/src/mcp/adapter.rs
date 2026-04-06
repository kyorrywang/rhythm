use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::tools::{BaseTool, ToolResult, ToolExecutionContext};
use super::types::McpToolInfo;
use super::client::McpClientManager;

/// Sanitize a string segment for use in a tool name.
fn sanitize_segment(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();

    if sanitized.is_empty() {
        return "tool".to_string();
    }

    let first_char = sanitized.chars().next().unwrap();
    if !first_char.is_alphabetic() {
        format!("mcp_{}", sanitized)
    } else {
        sanitized
    }
}

/// Adapter that wraps an MCP-discovered tool as a Rhythm BaseTool.
pub struct McpToolAdapter {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    manager: Arc<Mutex<McpClientManager>>,
    server_name: String,
    tool_name: String,
}

impl McpToolAdapter {
    pub fn new(
        manager: Arc<Mutex<McpClientManager>>,
        tool_info: &McpToolInfo,
    ) -> Self {
        let server_segment = sanitize_segment(&tool_info.server_name);
        let tool_segment = sanitize_segment(&tool_info.name);

        Self {
            name: format!("mcp__{}__{}", server_segment, tool_segment),
            description: tool_info.description.clone(),
            input_schema: tool_info.input_schema.clone(),
            manager,
            server_name: tool_info.server_name.clone(),
            tool_name: tool_info.name.clone(),
        }
    }
}

#[async_trait]
impl BaseTool for McpToolAdapter {
    fn name(&self) -> String {
        self.name.clone()
    }

    fn description(&self) -> String {
        self.description.clone()
    }

    fn parameters(&self) -> Value {
        self.input_schema.clone()
    }

    fn is_read_only(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        args: Value,
        _ctx: &ToolExecutionContext,
    ) -> ToolResult {
        let manager = self.manager.lock().await;

        match manager
            .call_tool(&self.server_name, &self.tool_name, args)
            .await
        {
            Ok(output) => ToolResult::ok(output),
            Err(e) => ToolResult::error(format!("MCP tool execution failed: {}", e)),
        }
    }
}
