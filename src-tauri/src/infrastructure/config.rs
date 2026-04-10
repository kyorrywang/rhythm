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
    #[serde(default)]
    pub capabilities: ModelCapabilities,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ProviderCapabilities {
    #[serde(default)]
    pub anthropic_extended_thinking: Option<bool>,
    #[serde(default)]
    pub anthropic_beta_headers: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModelCapabilities {
    #[serde(default)]
    pub anthropic_extended_thinking: Option<bool>,
    #[serde(default)]
    pub anthropic_beta_headers: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderModelConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default)]
    pub capabilities: ModelCapabilities,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    #[serde(default = "default_llm_provider")]
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub capabilities: ProviderCapabilities,
    #[serde(default)]
    pub models: Vec<ProviderModelConfig>,
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
            capabilities: ModelCapabilities {
                anthropic_extended_thinking: Some(true),
                anthropic_beta_headers: Some(true),
            },
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

// ─── Root Settings ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RhythmSettings {
    #[serde(default, skip_serializing)]
    pub llm: LlmConfig,
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
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
    /// Plugin enable/disable map keyed by plugin name (Phase 10).
    #[serde(default)]
    pub enabled_plugins: HashMap<String, bool>,
    /// Granted plugin permissions keyed by plugin name.
    #[serde(default)]
    pub plugin_permissions: HashMap<String, Vec<String>>,
}

impl Default for RhythmSettings {
    fn default() -> Self {
        Self {
            llm: LlmConfig::default(),
            providers: vec![ProviderConfig {
                id: "anthropic".to_string(),
                name: "Anthropic".to_string(),
                provider: "anthropic".to_string(),
                base_url: "https://api.anthropic.com".to_string(),
                api_key: "".to_string(),
                is_default: true,
                capabilities: ProviderCapabilities {
                    anthropic_extended_thinking: Some(true),
                    anthropic_beta_headers: Some(true),
                },
                models: vec![ProviderModelConfig {
                    id: "claude-opus-4-5".to_string(),
                    name: "claude-opus-4-5".to_string(),
                    is_default: true,
                    enabled: true,
                    note: None,
                    capabilities: ModelCapabilities {
                        anthropic_extended_thinking: Some(true),
                        anthropic_beta_headers: Some(true),
                    },
                }],
            }],
            agent_turn_limit: None,
            system_prompt: None,
            permission: PermissionConfig::default(),
            memory: MemoryConfig::default(),
            hooks: HooksConfig::default(),
            mcp_servers: HashMap::new(),
            enabled_plugins: HashMap::new(),
            plugin_permissions: HashMap::new(),
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

    normalize_provider_settings(&mut settings);
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
    let mut normalized = settings.clone();
    normalize_provider_settings(&mut normalized);
    let json = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn resolve_llm_config(
    settings: &RhythmSettings,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> Result<LlmConfig, String> {
    if settings.providers.is_empty() {
        let mut resolved = settings.llm.clone();
        if let Some(model) = model_id.map(str::trim).filter(|value| !value.is_empty()) {
            resolved.model = model.to_string();
        }
        return Ok(resolved);
    }

    let provider = if let Some(provider_id) = provider_id.map(str::trim).filter(|value| !value.is_empty()) {
        settings
            .providers
            .iter()
            .find(|provider| {
                provider.enabled_for_runtime()
                    && (provider.id.eq_ignore_ascii_case(provider_id)
                        || provider.name.eq_ignore_ascii_case(provider_id))
            })
            .ok_or_else(|| format!("Provider '{}' is not available", provider_id))?
    } else {
        default_provider(settings)
            .ok_or_else(|| "No enabled provider is configured".to_string())?
    };

    let model = if let Some(model_id) = model_id.map(str::trim).filter(|value| !value.is_empty()) {
        provider
            .models
            .iter()
            .find(|model| {
                model.enabled
                    && (model.id.eq_ignore_ascii_case(model_id)
                        || model.name.eq_ignore_ascii_case(model_id))
            })
            .ok_or_else(|| {
                format!(
                    "Model '{}' is not available under provider '{}'",
                    model_id, provider.id
                )
            })?
    } else {
        default_model(provider)
            .ok_or_else(|| format!("Provider '{}' has no enabled model", provider.id))?
    };

    Ok(LlmConfig {
        name: provider.name.clone(),
        provider: provider.provider.clone(),
        base_url: provider.base_url.clone(),
        api_key: provider.api_key.clone(),
        model: model.name.clone(),
        max_tokens: settings.llm.max_tokens,
        capabilities: merge_model_capabilities(&provider.capabilities, &model.capabilities),
    })
}

fn normalize_provider_settings(settings: &mut RhythmSettings) {
    if settings.providers.is_empty() {
        settings.providers = RhythmSettings::default().providers;
    }

    if !settings.providers.iter().any(|provider| provider.is_default) {
        if let Some(first) = settings.providers.first_mut() {
            first.is_default = true;
        }
    }

    for provider in &mut settings.providers {
        if provider.models.is_empty() {
            provider.models.push(ProviderModelConfig {
                id: provider.name.clone(),
                name: provider.name.clone(),
                is_default: true,
                enabled: true,
                note: None,
                capabilities: ModelCapabilities::default(),
            });
        }
        if !provider.models.iter().any(|model| model.is_default && model.enabled) {
            if let Some(first_enabled) = provider.models.iter_mut().find(|model| model.enabled) {
                first_enabled.is_default = true;
            } else if let Some(first) = provider.models.first_mut() {
                first.enabled = true;
                first.is_default = true;
            }
        }
    }

    if let Some(default_provider) = default_provider(settings) {
        if let Some(default_model) = default_model(default_provider) {
            settings.llm = LlmConfig {
                name: default_provider.name.clone(),
                provider: default_provider.provider.clone(),
                base_url: default_provider.base_url.clone(),
                api_key: default_provider.api_key.clone(),
                model: default_model.name.clone(),
                max_tokens: settings.llm.max_tokens,
                capabilities: merge_model_capabilities(&default_provider.capabilities, &default_model.capabilities),
            };
        }
    }
}

fn merge_model_capabilities(
    provider: &ProviderCapabilities,
    model: &ModelCapabilities,
) -> ModelCapabilities {
    ModelCapabilities {
        anthropic_extended_thinking: model
            .anthropic_extended_thinking
            .or(provider.anthropic_extended_thinking),
        anthropic_beta_headers: model
            .anthropic_beta_headers
            .or(provider.anthropic_beta_headers),
    }
}

fn default_provider(settings: &RhythmSettings) -> Option<&ProviderConfig> {
    settings
        .providers
        .iter()
        .find(|provider| provider.is_default && provider.enabled_for_runtime())
        .or_else(|| settings.providers.iter().find(|provider| provider.enabled_for_runtime()))
}

fn default_model(provider: &ProviderConfig) -> Option<&ProviderModelConfig> {
    provider
        .models
        .iter()
        .find(|model| model.is_default && model.enabled)
        .or_else(|| provider.models.iter().find(|model| model.enabled))
}

impl ProviderConfig {
    fn enabled_for_runtime(&self) -> bool {
        !self.base_url.trim().is_empty()
            && !self.api_key.trim().is_empty()
            && self.models.iter().any(|model| model.enabled)
    }
}
