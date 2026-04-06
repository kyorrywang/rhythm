use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Stdio server configuration: launch a subprocess.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpStdioServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub cwd: Option<String>,
}

/// HTTP server configuration.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpHttpServerConfig {
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

/// WebSocket server configuration.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpWebSocketServerConfig {
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

/// Union of all MCP server transport types.
/// Uses `type` as the discriminator to match common MCP config formats.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpServerConfig {
    Stdio(McpStdioServerConfig),
    Http(McpHttpServerConfig),
    Ws(McpWebSocketServerConfig),
}

/// Metadata about a tool discovered from an MCP server.
#[derive(Debug, Clone)]
pub struct McpToolInfo {
    pub server_name: String,
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// Metadata about a resource discovered from an MCP server.
#[derive(Debug, Clone)]
pub struct McpResourceInfo {
    pub server_name: String,
    pub name: String,
    pub uri: String,
    pub description: String,
}

/// Connection status for a single MCP server.
#[derive(Debug, Clone)]
pub struct McpConnectionStatus {
    pub name: String,
    pub state: McpState,
    pub detail: String,
    pub transport: String,
    pub tools: Vec<McpToolInfo>,
    pub resources: Vec<McpResourceInfo>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpState {
    #[default]
    Pending,
    Connected,
    Failed,
    Disabled,
}

impl McpConnectionStatus {
    pub fn pending(name: &str, transport: &str) -> Self {
        Self {
            name: name.to_string(),
            state: McpState::Pending,
            detail: String::new(),
            transport: transport.to_string(),
            tools: Vec::new(),
            resources: Vec::new(),
        }
    }

    pub fn connected(
        name: &str,
        transport: &str,
        tools: Vec<McpToolInfo>,
        resources: Vec<McpResourceInfo>,
    ) -> Self {
        Self {
            name: name.to_string(),
            state: McpState::Connected,
            detail: String::new(),
            transport: transport.to_string(),
            tools,
            resources,
        }
    }

    pub fn failed(name: &str, transport: &str, detail: impl Into<String>) -> Self {
        Self {
            name: name.to_string(),
            state: McpState::Failed,
            detail: detail.into(),
            transport: transport.to_string(),
            tools: Vec::new(),
            resources: Vec::new(),
        }
    }
}
