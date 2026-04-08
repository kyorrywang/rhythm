use std::collections::HashMap;
use std::path::PathBuf;

use crate::infrastructure::config::HookConfig;
use crate::mcp::types::McpServerConfig;
use crate::skills::types::SkillDefinition;

// ─── Plugin Manifest ─────────────────────────────────────────────────────────

/// Parsed contents of `plugin.json` at the root of every plugin directory.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PluginManifest {
    /// Unique plugin identifier (also used as directory name).
    pub name: String,
    /// Semantic version string (e.g. "1.0.0").
    #[serde(default = "default_version")]
    pub version: String,
    /// Human-readable description shown in the UI.
    #[serde(default)]
    pub description: String,
    /// Whether the plugin is enabled unless the user explicitly disables it.
    #[serde(default = "default_true", alias = "enabledByDefault")]
    pub enabled_by_default: bool,
    /// JavaScript plugin entrypoint, for example "dist/main.js" or "src/main.tsx" in dev mode.
    #[serde(default, alias = "main")]
    pub entry: Option<String>,
    /// Development-only plugin entrypoint, for example { "main": "src/main.tsx" }.
    #[serde(default)]
    pub dev: PluginDevConfig,
    /// Host capabilities requested by this plugin.
    #[serde(default)]
    pub permissions: Vec<String>,
    /// Hard dependencies and capability requirements.
    #[serde(default)]
    pub requires: PluginRequires,
    /// Capabilities exposed by this plugin for other plugins to consume.
    #[serde(default)]
    pub provides: PluginProvides,
    /// UI/command/tool contributions declared by this plugin.
    #[serde(default)]
    pub contributes: PluginContributions,
    /// Subdirectory containing Skill Markdown files (default: "skills").
    #[serde(default = "default_skills_dir", alias = "skillsDir")]
    pub skills_dir: String,
    /// File name for hook definitions (default: "hooks.json").
    #[serde(default = "default_hooks_file", alias = "hooksFile")]
    pub hooks_file: String,
    /// File name for MCP server list (default: "mcp.json").
    #[serde(default = "default_mcp_file", alias = "mcpFile")]
    pub mcp_file: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct PluginRequires {
    /// Hard plugin dependencies keyed by plugin id, with a simple version range.
    #[serde(default)]
    pub plugins: HashMap<String, String>,
    /// Capability requirements. Core and enabled plugins can satisfy these.
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub commands: Vec<String>,
    #[serde(default)]
    pub tools: Vec<String>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct PluginProvides {
    #[serde(default)]
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct PluginDevConfig {
    #[serde(default)]
    pub main: Option<String>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct PluginContributions {
    #[serde(default, alias = "activityBar")]
    pub activity_bar: Vec<serde_json::Value>,
    #[serde(default)]
    pub views: Vec<serde_json::Value>,
    #[serde(default)]
    pub menus: Vec<serde_json::Value>,
    #[serde(default, alias = "leftPanelViews")]
    pub left_panel_views: Vec<serde_json::Value>,
    #[serde(default, alias = "workbenchViews")]
    pub workbench_views: Vec<serde_json::Value>,
    #[serde(default)]
    pub commands: Vec<serde_json::Value>,
    #[serde(default, alias = "agentTools", alias = "tools")]
    pub agent_tools: Vec<serde_json::Value>,
    #[serde(default, alias = "skills")]
    pub skills: Vec<serde_json::Value>,
    #[serde(default, alias = "settingsSections")]
    pub settings_sections: Vec<serde_json::Value>,
    #[serde(default, alias = "messageActions")]
    pub message_actions: Vec<serde_json::Value>,
    #[serde(default, alias = "toolResultActions")]
    pub tool_result_actions: Vec<serde_json::Value>,
    #[serde(default, alias = "treeItemActions")]
    pub tree_item_actions: Vec<serde_json::Value>,
    #[serde(default, alias = "workflowNodes")]
    pub workflow_nodes: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginStatus {
    Enabled,
    Disabled,
    Blocked,
    Error,
}

fn default_version() -> String {
    "0.0.0".to_string()
}

fn default_true() -> bool {
    true
}

fn default_skills_dir() -> String {
    "skills".to_string()
}

fn default_hooks_file() -> String {
    "hooks.json".to_string()
}

fn default_mcp_file() -> String {
    "mcp.json".to_string()
}

// ─── Loaded Plugin ────────────────────────────────────────────────────────────

/// Runtime representation of a successfully loaded plugin.
#[derive(Debug, Clone)]
pub struct LoadedPlugin {
    pub manifest: PluginManifest,
    /// Absolute path to the plugin's root directory.
    pub path: PathBuf,
    /// Whether the user/default settings requested this plugin to be enabled.
    pub configured_enabled: bool,
    /// Effective runtime state. This is false for disabled and blocked plugins.
    pub enabled: bool,
    pub status: PluginStatus,
    pub blocked_reason: Option<String>,
    pub granted_permissions: Vec<String>,
    /// Skills contributed by this plugin.
    pub skills: Vec<SkillDefinition>,
    /// Hooks contributed by this plugin, keyed by event name
    /// ("pre_tool_use", "post_tool_use", "session_start", "session_end").
    pub hooks: HashMap<String, Vec<HookConfig>>,
    /// MCP server configurations contributed by this plugin.
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

impl LoadedPlugin {
    pub fn name(&self) -> &str {
        &self.manifest.name
    }

    pub fn description(&self) -> &str {
        &self.manifest.description
    }
}

/// Summary suitable for serialisation to the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PluginSummary {
    pub name: String,
    pub version: String,
    pub description: String,
    pub enabled: bool,
    pub configured_enabled: bool,
    pub status: PluginStatus,
    pub blocked_reason: Option<String>,
    pub skills_count: usize,
    pub hooks_count: usize,
    pub mcp_servers_count: usize,
    pub path: String,
    pub main: Option<String>,
    pub dev_main: Option<String>,
    pub entry: Option<String>,
    pub permissions: Vec<String>,
    pub granted_permissions: Vec<String>,
    pub requires: PluginRequires,
    pub provides: PluginProvides,
    pub contributes: PluginContributions,
}

impl From<&LoadedPlugin> for PluginSummary {
    fn from(p: &LoadedPlugin) -> Self {
        PluginSummary {
            name: p.manifest.name.clone(),
            version: p.manifest.version.clone(),
            description: p.manifest.description.clone(),
            enabled: p.enabled,
            configured_enabled: p.configured_enabled,
            status: p.status,
            blocked_reason: p.blocked_reason.clone(),
            skills_count: p.skills.len(),
            hooks_count: p.hooks.values().map(Vec::len).sum(),
            mcp_servers_count: p.mcp_servers.len(),
            path: p.path.to_string_lossy().to_string(),
            main: p.manifest.entry.clone(),
            dev_main: p.manifest.dev.main.clone(),
            entry: p.manifest.entry.clone(),
            permissions: p.manifest.permissions.clone(),
            granted_permissions: p.granted_permissions.clone(),
            requires: p.manifest.requires.clone(),
            provides: p.manifest.provides.clone(),
            contributes: p.manifest.contributes.clone(),
        }
    }
}
