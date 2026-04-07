use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub mod ask;
pub mod context;
pub mod delete_file;
pub mod edit_file;
pub mod list_dir;
pub mod plan;
pub mod read_file;
pub mod shell;
pub mod skill;
pub mod subagent;
pub mod write_file;

pub use context::ToolExecutionContext;

// ─── ToolResult ─────────────────────────────────────────────────────────────

/// The result returned by every tool execution.
pub struct ToolResult {
    pub output: String,
    pub is_error: bool,
}

impl ToolResult {
    pub fn ok(output: impl Into<String>) -> Self {
        Self {
            output: output.into(),
            is_error: false,
        }
    }

    pub fn error(output: impl Into<String>) -> Self {
        Self {
            output: output.into(),
            is_error: true,
        }
    }
}

// ─── BaseTool ────────────────────────────────────────────────────────────────

/// The standard tool interface.  All Rhythm tools must implement this.
#[async_trait]
pub trait BaseTool: Send + Sync {
    /// Unique name as recognised by the LLM.
    fn name(&self) -> String;
    /// Human-readable description sent to the LLM in the tool schema.
    fn description(&self) -> String;
    /// JSON-Schema for the tool's input parameters.
    fn parameters(&self) -> Value;
    /// Whether this tool only reads state (never writes/deletes/executes).
    /// Used by the permission system to allow reads without confirmation.
    fn is_read_only(&self) -> bool {
        false
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult;
}

// ─── LlmToolDefinition ──────────────────────────────────────────────────────

/// The schema representation sent to the LLM API.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct LlmToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

// ─── ToolRegistry ────────────────────────────────────────────────────────────

pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn BaseTool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: Box<dyn BaseTool>) {
        self.tools.insert(tool.name().to_string(), tool);
    }

    pub fn get(&self, name: &str) -> Option<&dyn BaseTool> {
        self.tools.get(name).map(|b| b.as_ref())
    }

    pub fn to_api_schema(&self) -> Vec<LlmToolDefinition> {
        let mut defs: Vec<LlmToolDefinition> = self
            .tools
            .values()
            .map(|t| LlmToolDefinition {
                name: t.name().to_string(),
                description: t.description().to_string(),
                parameters: t.parameters(),
            })
            .collect();
        defs.sort_by(|a, b| a.name.cmp(&b.name));
        defs
    }

    pub fn filter_for_agent(
        mut self,
        allowed_tools: Option<&[String]>,
        disallowed_tools: Option<&[String]>,
    ) -> Self {
        if let Some(allowed) = allowed_tools {
            self.tools
                .retain(|name, _| allowed.iter().any(|tool| tool == name));
        }

        if let Some(disallowed) = disallowed_tools {
            self.tools
                .retain(|name, _| !disallowed.iter().any(|tool| tool == name));
        }

        self
    }

    /// Register all built-in tools and return the ready registry.
    pub fn create_default() -> Self {
        Self::create_with_mcp(None)
    }

    pub fn create_with_mcp(mcp_manager: Option<Arc<Mutex<crate::mcp::McpClientManager>>>) -> Self {
        Self::create_with_plugins_and_mcp(&[], mcp_manager)
    }

    pub fn create_with_plugins_and_mcp(
        plugins: &[crate::plugins::LoadedPlugin],
        mcp_manager: Option<Arc<Mutex<crate::mcp::McpClientManager>>>,
    ) -> Self {
        let mut registry = Self::new();
        registry.register(Box::new(shell::ShellTool));
        registry.register(Box::new(read_file::ReadFileTool));
        registry.register(Box::new(write_file::WriteFileTool));
        registry.register(Box::new(edit_file::EditFileTool));
        registry.register(Box::new(delete_file::DeleteFileTool));
        registry.register(Box::new(list_dir::ListDirTool));
        registry.register(Box::new(ask::AskTool));
        registry.register(Box::new(plan::PlanTool));
        registry.register(Box::new(subagent::SubagentTool));
        registry.register(Box::new(skill::SkillTool));

        for plugin in plugins {
            if !plugin.enabled {
                continue;
            }
            for declaration in &plugin.manifest.contributes.agent_tools {
                if let Some(tool) = crate::plugins::PluginToolAdapter::from_manifest(
                    plugin.name(),
                    plugin.path.clone(),
                    declaration,
                ) {
                    registry.register(Box::new(tool));
                }
            }
        }

        if let Some(manager) = mcp_manager {
            let tool_infos = {
                let guard = manager.blocking_lock();
                guard.list_tools()
            };
            for tool_info in tool_infos {
                registry.register(Box::new(crate::mcp::McpToolAdapter::new(
                    manager.clone(),
                    &tool_info,
                )));
            }
        }

        registry
    }

    pub fn create_for_agent(
        mcp_manager: Option<Arc<Mutex<crate::mcp::McpClientManager>>>,
        allowed_tools: Option<&[String]>,
        disallowed_tools: Option<&[String]>,
    ) -> Self {
        Self::create_with_mcp(mcp_manager).filter_for_agent(allowed_tools, disallowed_tools)
    }

    pub fn create_for_agent_with_plugins(
        plugins: &[crate::plugins::LoadedPlugin],
        mcp_manager: Option<Arc<Mutex<crate::mcp::McpClientManager>>>,
        allowed_tools: Option<&[String]>,
        disallowed_tools: Option<&[String]>,
    ) -> Self {
        Self::create_with_plugins_and_mcp(plugins, mcp_manager)
            .filter_for_agent(allowed_tools, disallowed_tools)
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::create_default()
    }
}
