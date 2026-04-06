use std::collections::HashMap;
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::Mutex;
use serde_json::{json, Value};

use super::types::{
    McpConnectionStatus, McpServerConfig, McpState, McpToolInfo, McpResourceInfo,
    McpStdioServerConfig,
};

/// A single active MCP session (stdio transport).
struct McpSession {
    /// The child process stdin/stdout handles are managed via the session.
    /// We use a simplified approach: keep the child process and a request ID counter.
    child: tokio::process::Child,
    request_id: u64,
}

/// Manages all MCP server connections.
pub struct McpClientManager {
    server_configs: HashMap<String, McpServerConfig>,
    statuses: HashMap<String, McpConnectionStatus>,
    sessions: HashMap<String, Arc<Mutex<McpSession>>>,
}

impl McpClientManager {
    pub fn new(server_configs: HashMap<String, McpServerConfig>) -> Self {
        let mut statuses = HashMap::new();
        for (name, config) in &server_configs {
            let transport = match config {
                McpServerConfig::Stdio(_) => "stdio",
                McpServerConfig::Http(_) => "http",
                McpServerConfig::Ws(_) => "ws",
            };
            statuses.insert(name.clone(), McpConnectionStatus::pending(name, transport));
        }

        Self {
            server_configs,
            statuses,
            sessions: HashMap::new(),
        }
    }

    pub fn merged_server_configs(
        settings: &crate::infrastructure::config::RhythmSettings,
        cwd: &std::path::Path,
    ) -> HashMap<String, McpServerConfig> {
        let mut configs = settings.mcp_servers.clone();
        for plugin in crate::plugins::load_plugins(settings, cwd) {
            if plugin.enabled {
                for (name, config) in plugin.mcp_servers {
                    configs.insert(name, config);
                }
            }
        }
        configs
    }

    /// Connect all configured stdio MCP servers.
    pub async fn connect_all(&mut self) {
        let configs: Vec<(String, McpServerConfig)> =
            self.server_configs.drain().collect();

        for (name, config) in configs {
            match &config {
                McpServerConfig::Stdio(stdio_cfg) => {
                    match self.connect_stdio(&name, stdio_cfg).await {
                        Ok(_) => {
                            self.server_configs.insert(name.clone(), config);
                        }
                        Err(e) => {
                            let transport = "stdio";
                            self.statuses.insert(
                                name.clone(),
                                McpConnectionStatus::failed(&name, transport, &e),
                            );
                        }
                    }
                }
                McpServerConfig::Http(_) | McpServerConfig::Ws(_) => {
                    let transport = match &config {
                        McpServerConfig::Http(_) => "http",
                        McpServerConfig::Ws(_) => "ws",
                        _ => unreachable!(),
                    };
                    self.statuses.insert(
                        name.clone(),
                        McpConnectionStatus::failed(
                            &name,
                            transport,
                            "Unsupported MCP transport in current build",
                        ),
                    );
                }
            }
        }
    }

    /// Reconnect all servers (close existing, then connect_all).
    pub async fn reconnect_all(&mut self) {
        self.close().await;
        // Restore configs from statuses that were connected/failed
        // For simplicity, caller should re-provide configs
    }

    /// Close all active MCP sessions.
    pub async fn close(&mut self) {
        for (name, session) in self.sessions.drain() {
            let mut session = session.lock().await;
            let _ = session.child.kill().await;
            let _ = session.child.wait().await;
            if let Some(status) = self.statuses.get_mut(&name) {
                status.state = McpState::Pending;
                status.tools.clear();
                status.resources.clear();
            }
        }
    }

    /// Return all discovered MCP tools.
    pub fn list_tools(&self) -> Vec<McpToolInfo> {
        self.statuses
            .values()
            .filter(|s| matches!(s.state, McpState::Connected))
            .flat_map(|s| s.tools.clone())
            .collect()
    }

    /// Return all discovered MCP resources.
    pub fn list_resources(&self) -> Vec<McpResourceInfo> {
        self.statuses
            .values()
            .filter(|s| matches!(s.state, McpState::Connected))
            .flat_map(|s| s.resources.clone())
            .collect()
    }

    /// Return connection statuses for all servers.
    pub fn list_statuses(&self) -> Vec<McpConnectionStatus> {
        let mut statuses: Vec<_> = self.statuses.values().cloned().collect();
        statuses.sort_by(|a, b| a.name.cmp(&b.name));
        statuses
    }

    /// Call an MCP tool on a specific server.
    pub async fn call_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: Value,
    ) -> Result<String, String> {
        let session = self
            .sessions
            .get(server_name)
            .ok_or_else(|| format!("MCP server '{}' not connected", server_name))?;

        let mut session = session.lock().await;
        session.request_id += 1;
        let id = session.request_id;

        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments,
            }
        });

        let response = send_jsonrpc_request(&mut session.child, &request).await?;

        // Parse the response content
        let content = response
            .get("result")
            .and_then(|r| r.get("content"))
            .and_then(|c| c.as_array())
            .map(|arr| {
                let parts: Vec<String> = arr
                    .iter()
                    .map(|item| {
                        if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                            item.get("text")
                                .and_then(|t| t.as_str())
                                .unwrap_or("")
                                .to_string()
                        } else {
                            serde_json::to_string(item).unwrap_or_default()
                        }
                    })
                    .collect();
                parts.join("\n").trim().to_string()
            })
            .unwrap_or_else(|| "(no output)".to_string());

        Ok(content)
    }

    /// Read an MCP resource by server and URI.
    pub async fn read_resource(
        &self,
        server_name: &str,
        uri: &str,
    ) -> Result<String, String> {
        let session = self
            .sessions
            .get(server_name)
            .ok_or_else(|| format!("MCP server '{}' not connected", server_name))?;

        let mut session = session.lock().await;
        session.request_id += 1;
        let id = session.request_id;

        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "resources/read",
            "params": {
                "uri": uri,
            }
        });

        let response = send_jsonrpc_request(&mut session.child, &request).await?;

        let content = response
            .get("result")
            .and_then(|r| r.get("contents"))
            .and_then(|c| c.as_array())
            .map(|arr| {
                let parts: Vec<String> = arr
                    .iter()
                    .map(|item| {
                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                            text.to_string()
                        } else if let Some(blob) = item.get("blob").and_then(|b| b.as_str()) {
                            blob.to_string()
                        } else {
                            serde_json::to_string(item).unwrap_or_default()
                        }
                    })
                    .collect();
                parts.join("\n").trim().to_string()
            })
            .unwrap_or_else(|| "(no content)".to_string());

        Ok(content)
    }

    /// Connect to a single stdio MCP server.
    async fn connect_stdio(
        &mut self,
        name: &str,
        config: &McpStdioServerConfig,
    ) -> Result<(), String> {
        let mut cmd = Command::new(&config.command);
        cmd.args(&config.args);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        for (k, v) in &config.env {
            cmd.env(k, v);
        }

        if let Some(cwd) = &config.cwd {
            cmd.current_dir(cwd);
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn MCP server '{}': {}", name, e))?;

        let mut session = McpSession {
            child,
            request_id: 0,
        };

        // Send initialize request
        session.request_id += 1;
        let init_request = json!({
            "jsonrpc": "2.0",
            "id": session.request_id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "rhythm",
                    "version": "0.1.0"
                }
            }
        });

        let _init_response = send_jsonrpc_request(&mut session.child, &init_request).await?;

        // Send initialized notification
        session.request_id += 1;
        let init_notification = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        write_jsonrpc_line(&mut session.child, &init_notification).await?;

        // List tools
        session.request_id += 1;
        let tools_request = json!({
            "jsonrpc": "2.0",
            "id": session.request_id,
            "method": "tools/list",
            "params": {}
        });

        let tools_response = send_jsonrpc_request(&mut session.child, &tools_request).await?;

        let tools: Vec<McpToolInfo> = tools_response
            .get("result")
            .and_then(|r| r.get("tools"))
            .and_then(|t| t.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| {
                        let name = t.get("name")?.as_str()?.to_string();
                        let description = t
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("")
                            .to_string();
                        let input_schema = t
                            .get("inputSchema")
                            .cloned()
                            .unwrap_or(json!({"type": "object", "properties": {}}));
                        Some(McpToolInfo {
                            server_name: name.to_string(),
                            name,
                            description,
                            input_schema,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        // List resources
        session.request_id += 1;
        let resources_request = json!({
            "jsonrpc": "2.0",
            "id": session.request_id,
            "method": "resources/list",
            "params": {}
        });

        let resources_response = send_jsonrpc_request(&mut session.child, &resources_request).await;

        let resources: Vec<McpResourceInfo> = resources_response
            .ok()
            .and_then(|r| {
                r.get("result")
                    .and_then(|r| r.get("resources"))
                    .and_then(|t| t.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|r| {
                                let uri = r.get("uri")?.as_str()?.to_string();
                                let res_name = r
                                    .get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or(&uri)
                                    .to_string();
                                let description = r
                                    .get("description")
                                    .and_then(|d| d.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                Some(McpResourceInfo {
                                    server_name: name.to_string(),
                                    name: res_name,
                                    uri,
                                    description,
                                })
                            })
                            .collect()
                    })
            })
            .unwrap_or_default();

        // Store session
        self.sessions
            .insert(name.to_string(), Arc::new(Mutex::new(session)));

        // Update status
        self.statuses.insert(
            name.to_string(),
            McpConnectionStatus::connected(name, "stdio", tools, resources),
        );

        Ok(())
    }
}

/// Send a JSON-RPC request line to the child process stdin and read the response.
async fn send_jsonrpc_request(
    child: &mut tokio::process::Child,
    request: &Value,
) -> Result<Value, String> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    let stdin = child
        .stdin
        .as_mut()
        .ok_or("Child stdin not available")?;
    let stdout = child
        .stdout
        .as_mut()
        .ok_or("Child stdout not available")?;

    // Write request + newline
    let line = serde_json::to_string(request).map_err(|e| e.to_string())?;
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stdin
        .write_all(b"\n")
        .await
        .map_err(|e| e.to_string())?;
    stdin.flush().await.map_err(|e| e.to_string())?;

    // Read response line
    let mut reader = BufReader::new(stdout);
    let mut response_line = String::new();
    reader
        .read_line(&mut response_line)
        .await
        .map_err(|e| e.to_string())?;

    let response: Value =
        serde_json::from_str(&response_line).map_err(|e| e.to_string())?;

    // Check for error response
    if let Some(error) = response.get("error") {
        return Err(format!("MCP error: {}", error));
    }

    Ok(response)
}

/// Write a JSON-RPC message (notification, no response expected) to child stdin.
async fn write_jsonrpc_line(
    child: &mut tokio::process::Child,
    message: &Value,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let stdin = child
        .stdin
        .as_mut()
        .ok_or("Child stdin not available")?;
    let line = serde_json::to_string(message).map_err(|e| e.to_string())?;
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stdin
        .write_all(b"\n")
        .await
        .map_err(|e| e.to_string())?;
    stdin.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}
