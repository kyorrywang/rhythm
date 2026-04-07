use crate::infrastructure::paths;
use crate::mcp::types::McpServerConfig;
use crate::permissions::modes::PermissionMode;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

// ─── LLM Config ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmConfig {
    #[serde(default = "default_llm_name")]
    pub name: String,
    #[serde(default = "default_llm_provider")]
    pub provider: String, // API format: "openai" or "anthropic"
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub max_tokens: Option<u32>,
}

fn default_llm_name() -> String {
    "Anthropic".to_string()
}

fn default_llm_provider() -> String {
    "anthropic".to_string()
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            name: default_llm_name(),
            provider: "anthropic".to_string(),
            base_url: "https://api.anthropic.com".to_string(),
            api_key: "".to_string(),
            model: "claude-opus-4-5".to_string(),
            max_tokens: Some(16384),
        }
    }
}

// ─── Permission Config ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PathRuleConfig {
    pub pattern: String,
    #[serde(default = "default_allow")]
    pub allow: bool,
}

fn default_allow() -> bool {
    true
}

fn default_permission_mode() -> PermissionMode {
    PermissionMode::Default
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PermissionConfig {
    #[serde(default = "default_permission_mode")]
    pub mode: PermissionMode,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub denied_tools: Vec<String>,
    #[serde(default)]
    pub path_rules: Vec<PathRuleConfig>,
    #[serde(default)]
    pub denied_commands: Vec<String>,
}

impl Default for PermissionConfig {
    fn default() -> Self {
        Self {
            mode: PermissionMode::Default,
            allowed_tools: vec![],
            denied_tools: vec![],
            path_rules: vec![],
            denied_commands: vec![],
        }
    }
}

// ─── Memory Config ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MemoryConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_max_files")]
    pub max_files: usize,
    #[serde(default = "default_max_entrypoint_lines")]
    pub max_entrypoint_lines: usize,
}

fn default_true() -> bool {
    true
}

fn default_max_files() -> usize {
    5
}

fn default_max_entrypoint_lines() -> usize {
    200
}

impl Default for MemoryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_files: 5,
            max_entrypoint_lines: 200,
        }
    }
}

// ─── Hook Config ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CommandHookConfig {
    pub command: String,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    pub matcher: Option<String>,
    #[serde(default)]
    pub block_on_failure: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct HttpHookConfig {
    pub url: String,
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    pub matcher: Option<String>,
    #[serde(default)]
    pub block_on_failure: bool,
}

fn default_timeout() -> u64 {
    30
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum HookConfig {
    Command(CommandHookConfig),
    Http(HttpHookConfig),
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct HooksConfig {
    #[serde(default)]
    pub pre_tool_use: Vec<HookConfig>,
    #[serde(default)]
    pub post_tool_use: Vec<HookConfig>,
    #[serde(default)]
    pub session_start: Vec<HookConfig>,
    #[serde(default)]
    pub session_end: Vec<HookConfig>,
}

// ─── AutoCompact Config ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AutoCompactConfig {
    /// Whether to auto-compact message history when approaching token limits.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Fraction of max_tokens at which compaction triggers (e.g. 0.8 → 80%).
    #[serde(default = "default_threshold_ratio")]
    pub threshold_ratio: f32,
    /// How many micro-compacts to attempt before escalating to a full LLM summary.
    #[serde(default = "default_max_micro_compacts")]
    pub max_micro_compacts: usize,
}

fn default_threshold_ratio() -> f32 {
    0.8
}

fn default_max_micro_compacts() -> usize {
    3
}

impl Default for AutoCompactConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            threshold_ratio: 0.8,
            max_micro_compacts: 3,
        }
    }
}

// ─── Root Settings ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RhythmSettings {
    pub llm: LlmConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_turn_limit: Option<usize>,
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub permission: PermissionConfig,
    #[serde(default)]
    pub memory: MemoryConfig,
    #[serde(default)]
    pub hooks: HooksConfig,
    #[serde(default)]
    pub mcp_servers: HashMap<String, McpServerConfig>,
    /// AutoCompact configuration (Phase 9).
    #[serde(default)]
    pub auto_compact: AutoCompactConfig,
    /// Plugin enable/disable map keyed by plugin name (Phase 10).
    #[serde(default)]
    pub enabled_plugins: HashMap<String, bool>,
}

impl Default for RhythmSettings {
    fn default() -> Self {
        Self {
            llm: LlmConfig::default(),
            agent_turn_limit: None,
            system_prompt: None,
            permission: PermissionConfig::default(),
            memory: MemoryConfig::default(),
            hooks: HooksConfig::default(),
            mcp_servers: HashMap::new(),
            auto_compact: AutoCompactConfig::default(),
            enabled_plugins: HashMap::new(),
        }
    }
}

/// Legacy alias kept for backward compat with existing `core/models/mod.rs` usage.
pub type Settings = RhythmSettings;

pub fn load_settings() -> RhythmSettings {
    let path = paths::get_settings_path();

    if !path.exists() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let default_settings = RhythmSettings::default();
        if let Err(e) = fs::write(
            &path,
            serde_json::to_string_pretty(&default_settings).unwrap(),
        ) {
            eprintln!("[config] Failed to write default settings: {}", e);
        }
        return default_settings;
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[config] Failed to read settings file: {}", e);
            return RhythmSettings::default();
        }
    };

    let mut settings = match serde_json::from_str(&content) {
        Ok(settings) => settings,
        Err(e) => {
            eprintln!(
                "[config] Failed to parse settings file, using defaults: {}",
                e
            );
            RhythmSettings::default()
        }
    };

    apply_env_overrides(&mut settings);
    settings
}

fn apply_env_overrides(settings: &mut RhythmSettings) {
    if let Ok(model) = std::env::var("RHYTHM_MODEL_OVERRIDE") {
        if !model.trim().is_empty() {
            settings.llm.model = model;
        }
    }

    if let Ok(mode) = std::env::var("RHYTHM_PERMISSION_MODE_OVERRIDE") {
        if !mode.trim().is_empty() {
            settings.permission.mode = PermissionMode::from_str(&mode);
        }
    }

    if let Ok(subagent_type) = std::env::var("RHYTHM_SUBAGENT_TYPE") {
        if let Some(agent_def) = crate::coordinator::get_builtin_agent(&subagent_type) {
            if let Some(model) = agent_def.model {
                settings.llm.model = model;
            }
            if let Some(mode) = agent_def.permission_mode {
                settings.permission.mode = mode;
            }
            if let Some(max_turns) = agent_def.max_turns {
                settings.agent_turn_limit = Some(max_turns);
            }
        }
    }
}

/// Persist the current settings to disk.
pub fn save_settings(settings: &RhythmSettings) -> Result<(), String> {
    let path = paths::get_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}
