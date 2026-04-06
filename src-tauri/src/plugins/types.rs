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
    #[serde(default = "default_true")]
    pub enabled_by_default: bool,
    /// Subdirectory containing Skill Markdown files (default: "skills").
    #[serde(default = "default_skills_dir")]
    pub skills_dir: String,
    /// File name for hook definitions (default: "hooks.json").
    #[serde(default = "default_hooks_file")]
    pub hooks_file: String,
    /// File name for MCP server list (default: "mcp.json").
    #[serde(default = "default_mcp_file")]
    pub mcp_file: String,
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
    /// Whether this plugin is currently enabled.
    pub enabled: bool,
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
    pub skills_count: usize,
    pub path: String,
}

impl From<&LoadedPlugin> for PluginSummary {
    fn from(p: &LoadedPlugin) -> Self {
        PluginSummary {
            name: p.manifest.name.clone(),
            version: p.manifest.version.clone(),
            description: p.manifest.description.clone(),
            enabled: p.enabled,
            skills_count: p.skills.len(),
            path: p.path.to_string_lossy().to_string(),
        }
    }
}
