use crate::domains::permissions::modes::PermissionMode;
use crate::platform::mcp::types::McpServerConfig;
use crate::platform::paths;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

#[path = "config_runtime.rs"]
mod runtime;
#[path = "config_store.rs"]
mod store;
#[path = "config_validation.rs"]
mod validation;

use runtime::*;
use validation::*;

#[cfg(test)]
use runtime::normalize_config_bundle;
#[cfg(test)]
use store::upgrade_config_bundle;
#[cfg(test)]
use validation::validate_config_bundle;

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
    #[serde(default)]
    pub history_tool_results: Option<HistoryToolResultsMode>,
    #[serde(default)]
    pub history_tool_result_tools: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum HistoryToolResultsMode {
    #[default]
    Preserve,
    Drop,
    AllowList,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModelCapabilities {
    #[serde(default)]
    pub anthropic_extended_thinking: Option<bool>,
    #[serde(default)]
    pub anthropic_beta_headers: Option<bool>,
    #[serde(default)]
    pub history_tool_results: Option<HistoryToolResultsMode>,
    #[serde(default)]
    pub history_tool_result_tools: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderModelConfig {
    pub id: String,
    pub name: String,
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
                history_tool_results: Some(HistoryToolResultsMode::Preserve),
                history_tool_result_tools: None,
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

// ─── Config Bundle ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ToolCatalogEntry {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub risk: String,
    #[serde(default)]
    pub read_only: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ToolsConfig {
    #[serde(default)]
    pub registry: HashMap<String, ToolCatalogEntry>,
    #[serde(default)]
    pub groups: HashMap<String, Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelDefaultsConfig {
    #[serde(default = "default_reasoning")]
    pub reasoning: String,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

impl Default for ModelDefaultsConfig {
    fn default() -> Self {
        Self {
            reasoning: default_reasoning(),
            max_tokens: Some(16384),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModelsConfig {
    #[serde(default)]
    pub defaults: ModelDefaultsConfig,
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RuntimePolicyConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_turn_limit: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PermissionPolicyDefinition {
    pub id: String,
    #[serde(default = "default_permission_mode")]
    pub mode: PermissionMode,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub denied_tools: Vec<String>,
    #[serde(default)]
    pub locked: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DelegationPolicyDefinition {
    pub id: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub root_may_execute: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_subagents_per_turn: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReviewPolicyDefinition {
    pub id: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub human_checkpoint_required: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompletionPolicyDefinition {
    pub id: String,
    pub strategy: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ObservabilityPolicyDefinition {
    pub id: String,
    #[serde(default = "default_true")]
    pub capture_resolved_spec: bool,
    #[serde(default = "default_true")]
    pub capture_provenance: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LimitPolicyDefinition {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_turn_limit: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PolicyCatalogConfig {
    #[serde(default)]
    pub permission: Vec<PermissionPolicyDefinition>,
    #[serde(default)]
    pub delegation: Vec<DelegationPolicyDefinition>,
    #[serde(default)]
    pub review: Vec<ReviewPolicyDefinition>,
    #[serde(default)]
    pub completion: Vec<CompletionPolicyDefinition>,
    #[serde(default)]
    pub observability: Vec<ObservabilityPolicyDefinition>,
    #[serde(default)]
    pub limits: Vec<LimitPolicyDefinition>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PoliciesConfig {
    #[serde(default)]
    pub permissions: PermissionConfig,
    #[serde(default)]
    pub runtime: RuntimePolicyConfig,
    #[serde(default)]
    pub catalog: PolicyCatalogConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PromptsConfig {
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub fragments: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AgentsConfig {
    #[serde(default = "default_agent_id")]
    pub default_agent_id: String,
    #[serde(default)]
    pub items: Vec<AgentDefinitionConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PluginsConfig {
    #[serde(default)]
    pub enabled: HashMap<String, bool>,
    #[serde(default)]
    pub permissions: HashMap<String, Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CoreConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_theme_preset")]
    pub theme_preset: String,
    #[serde(default = "default_true")]
    pub auto_save_sessions: bool,
    #[serde(default)]
    pub memory: MemoryConfig,
    #[serde(default)]
    pub hooks: HooksConfig,
    #[serde(default)]
    pub mcp_servers: HashMap<String, McpServerConfig>,
    #[serde(default)]
    pub plugins: PluginsConfig,
}

impl Default for CoreConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            theme_preset: default_theme_preset(),
            auto_save_sessions: true,
            memory: MemoryConfig::default(),
            hooks: HooksConfig::default(),
            mcp_servers: HashMap::new(),
            plugins: PluginsConfig::default(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigBundle {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub core: CoreConfig,
    #[serde(default)]
    pub models: ModelsConfig,
    #[serde(default)]
    pub tools: ToolsConfig,
    #[serde(default)]
    pub policies: PoliciesConfig,
    #[serde(default)]
    pub prompts: PromptsConfig,
    #[serde(default)]
    pub agents: AgentsConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelConfig {
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub reasoning: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentPermissions {
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub default_mode: Option<PermissionMode>,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub disallowed_tools: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentExecutionConfig {
    #[serde(default)]
    pub agent_turn_limit: Option<usize>,
    #[serde(default)]
    pub max_delegation_depth: Option<u32>,
    #[serde(default)]
    pub delegation_policy_ref: Option<String>,
    #[serde(default)]
    pub review_policy_ref: Option<String>,
    #[serde(default)]
    pub completion_policy_ref: Option<String>,
    #[serde(default)]
    pub observability_policy_ref: Option<String>,
    #[serde(default)]
    pub limit_policy_ref: Option<String>,
    #[serde(default)]
    pub available_delegate_agent_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentConfigKind {
    #[serde(rename = "primary")]
    Primary,
    #[serde(rename = "subagent")]
    Subagent,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentDefinitionConfig {
    pub id: String,
    pub label: String,
    pub description: String,
    #[serde(default)]
    pub kinds: Vec<AgentConfigKind>,
    #[serde(default)]
    pub prompt_refs: Vec<String>,
    #[serde(default)]
    pub model: AgentModelConfig,
    #[serde(default)]
    pub permissions: AgentPermissions,
    #[serde(default)]
    pub execution: AgentExecutionConfig,
    #[serde(default)]
    pub max_turns: Option<usize>,
}

pub fn has_agent_kind(agent: &AgentDefinitionConfig, kind: AgentConfigKind) -> bool {
    agent.kinds.contains(&kind)
}

fn primary_agents(settings: &RhythmSettings) -> Vec<AgentDefinitionConfig> {
    settings
        .agents
        .items
        .iter()
        .filter(|agent| has_agent_kind(agent, AgentConfigKind::Primary))
        .cloned()
        .collect()
}

fn subagent_agents(settings: &RhythmSettings) -> Vec<AgentDefinitionConfig> {
    settings
        .agents
        .items
        .iter()
        .filter(|agent| has_agent_kind(agent, AgentConfigKind::Subagent))
        .cloned()
        .collect()
}

#[derive(Debug, Clone)]
pub struct RuntimeIntent {
    pub agent_id: Option<String>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub reasoning: Option<String>,
    pub permission_mode: Option<PermissionMode>,
    pub allowed_tools: Option<Vec<String>>,
    pub disallowed_tools: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RuntimeEnvironmentOverrides {
    pub model_id: Option<String>,
    pub permission_mode: Option<PermissionMode>,
    pub agent_turn_limit: Option<usize>,
    pub agent_definition_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedDelegationPolicy {
    pub id: Option<String>,
    pub enabled: bool,
    pub root_may_execute: bool,
    pub max_subagents_per_turn: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedReviewPolicy {
    pub id: Option<String>,
    pub required: bool,
    pub human_checkpoint_required: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedCompletionPolicy {
    pub id: Option<String>,
    pub strategy: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedObservabilityPolicy {
    pub id: Option<String>,
    pub capture_resolved_spec: bool,
    pub capture_provenance: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeResolutionProvenance {
    pub agent_id: String,
    pub provider_source: String,
    pub model_source: String,
    pub reasoning_source: String,
    pub permission_policy_source: String,
    pub delegation_policy_source: String,
    pub review_policy_source: String,
    pub completion_policy_source: String,
    pub observability_policy_source: String,
    pub limit_policy_source: String,
    pub env_overrides_applied: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ResolvedAgentSpec {
    pub agent: AgentDefinitionConfig,
    pub delegate_agents: Vec<AgentDefinitionConfig>,
    pub llm: LlmConfig,
    pub reasoning: Option<String>,
    pub permission: PermissionConfig,
    pub prompt_refs: Vec<String>,
    pub agent_turn_limit: Option<usize>,
    pub delegation: ResolvedDelegationPolicy,
    pub review: ResolvedReviewPolicy,
    pub completion: ResolvedCompletionPolicy,
    pub observability: ResolvedObservabilityPolicy,
    pub provenance: RuntimeResolutionProvenance,
    pub env_overrides: RuntimeEnvironmentOverrides,
}

fn default_schema_version() -> u32 {
    2
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_theme_preset() -> String {
    "grand".to_string()
}

fn default_agent_id() -> String {
    "chat".to_string()
}

fn default_reasoning() -> String {
    "medium".to_string()
}

impl Default for ConfigBundle {
    fn default() -> Self {
        Self {
            schema_version: default_schema_version(),
            core: CoreConfig::default(),
            models: ModelsConfig {
                defaults: ModelDefaultsConfig::default(),
                providers: vec![ProviderConfig {
                    id: "anthropic".to_string(),
                    name: "Anthropic".to_string(),
                    provider: "anthropic".to_string(),
                    base_url: "https://api.anthropic.com".to_string(),
                    api_key: "".to_string(),
                    capabilities: ProviderCapabilities {
                        anthropic_extended_thinking: Some(true),
                        anthropic_beta_headers: Some(true),
                        history_tool_results: Some(HistoryToolResultsMode::Preserve),
                        history_tool_result_tools: None,
                    },
                    models: vec![ProviderModelConfig {
                        id: "claude-opus-4-5".to_string(),
                        name: "claude-opus-4-5".to_string(),
                        enabled: true,
                        note: None,
                        capabilities: ModelCapabilities {
                            anthropic_extended_thinking: Some(true),
                            anthropic_beta_headers: Some(true),
                            history_tool_results: None,
                            history_tool_result_tools: None,
                        },
                    }],
                }],
            },
            tools: ToolsConfig::default(),
            policies: PoliciesConfig {
                permissions: PermissionConfig::default(),
                runtime: RuntimePolicyConfig::default(),
                catalog: PolicyCatalogConfig::default(),
            },
            prompts: PromptsConfig {
                system_prompt: None,
                fragments: HashMap::new(),
            },
            agents: AgentsConfig {
                default_agent_id: default_agent_id(),
                items: vec![],
            },
        }
    }
}

pub type RhythmSettings = ConfigBundle;
pub type Settings = ConfigBundle;

pub fn load_config_bundle() -> ConfigBundle {
    store::load_config_bundle()
}

pub fn load_settings() -> ConfigBundle {
    load_config_bundle()
}

/// Persist the current config bundle to disk.
pub fn save_config_bundle(bundle: &ConfigBundle) -> Result<(), String> {
    store::save_config_bundle(bundle)
}

pub fn save_settings(settings: &ConfigBundle) -> Result<(), String> {
    save_config_bundle(settings)
}

pub fn resolve_llm_config(
    settings: &RhythmSettings,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> Result<LlmConfig, String> {
    runtime::resolve_llm_config(settings, provider_id, model_id)
}

pub fn list_primary_agents(settings: &RhythmSettings) -> Vec<AgentDefinitionConfig> {
    primary_agents(settings)
}

pub fn list_subagent_agents(settings: &RhythmSettings) -> Vec<AgentDefinitionConfig> {
    subagent_agents(settings)
}

pub fn resolve_subagent_definition(
    settings: &RhythmSettings,
    subagent_id: &str,
) -> Option<AgentDefinitionConfig> {
    runtime::resolve_subagent_definition(settings, subagent_id)
}

pub fn resolve_delegate_agents(
    settings: &RhythmSettings,
    agent: &AgentDefinitionConfig,
) -> Vec<AgentDefinitionConfig> {
    runtime::resolve_delegate_agents(settings, agent)
}

pub fn render_prompt_fragments(settings: &RhythmSettings, prompt_refs: &[String]) -> String {
    runtime::render_prompt_fragments(settings, prompt_refs)
}

pub fn resolve_agent_definition(
    settings: &RhythmSettings,
    agent_id: Option<&str>,
) -> AgentDefinitionConfig {
    runtime::resolve_agent_definition(settings, agent_id)
}

pub fn should_delegate_task(
    runtime_spec: &ResolvedAgentSpec,
    prompt: &str,
    _attachment_count: usize,
) -> bool {
    runtime::should_delegate_task(runtime_spec, prompt, _attachment_count)
}

pub fn resolve_runtime_spec(
    settings: &RhythmSettings,
    intent: RuntimeIntent,
) -> Result<ResolvedAgentSpec, String> {
    runtime::resolve_runtime_spec(settings, intent)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn runtime_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn clear_runtime_override_env() {
        std::env::remove_var("RHYTHM_MODEL_OVERRIDE");
        std::env::remove_var("RHYTHM_PERMISSION_MODE_OVERRIDE");
        std::env::remove_var("RHYTHM_AGENT_DEFINITION_ID");
    }

    #[test]
    fn load_settings_does_not_mutate_file_backed_settings_with_env_overrides() {
        let _guard = runtime_env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        clear_runtime_override_env();
        std::env::set_var("RHYTHM_MODEL_OVERRIDE", "env-model");
        std::env::set_var("RHYTHM_PERMISSION_MODE_OVERRIDE", "full_auto");

        let settings = RhythmSettings::default();

        assert_eq!(
            settings.models.providers[0].models[0].name,
            "claude-opus-4-5"
        );
        assert_eq!(settings.policies.permissions.mode, PermissionMode::Default);

        clear_runtime_override_env();
    }

    #[test]
    fn resolve_runtime_spec_applies_env_overrides_as_runtime_layer() {
        let _guard = runtime_env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        clear_runtime_override_env();
        std::env::set_var("RHYTHM_MODEL_OVERRIDE", "env-model");
        std::env::set_var("RHYTHM_PERMISSION_MODE_OVERRIDE", "full_auto");

        let mut settings = RhythmSettings::default();
        settings.models.providers = vec![ProviderConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            provider: "openai".to_string(),
            base_url: "https://example.com".to_string(),
            api_key: "key".to_string(),
            capabilities: ProviderCapabilities::default(),
            models: vec![ProviderModelConfig {
                id: "env-model".to_string(),
                name: "env-model".to_string(),
                enabled: true,
                note: None,
                capabilities: ModelCapabilities::default(),
            }],
        }];
        settings.policies.permissions.mode = PermissionMode::Default;
        settings.agents.items = vec![AgentDefinitionConfig {
            id: "chat".to_string(),
            label: "Chat".to_string(),
            description: "test".to_string(),
            kinds: vec![AgentConfigKind::Primary],
            prompt_refs: vec![],
            model: AgentModelConfig::default(),
            permissions: AgentPermissions {
                locked: false,
                default_mode: None,
                allowed_tools: vec![],
                disallowed_tools: vec![],
            },
            execution: AgentExecutionConfig::default(),
            max_turns: None,
        }];
        normalize_config_bundle(&mut settings);

        let resolved = resolve_runtime_spec(
            &settings,
            RuntimeIntent {
                agent_id: Some("chat".to_string()),
                provider_id: Some("test".to_string()),
                model_id: None,
                reasoning: None,
                permission_mode: None,
                allowed_tools: None,
                disallowed_tools: None,
            },
        )
        .expect("runtime spec should resolve");

        assert_eq!(resolved.llm.model, "env-model");
        assert_eq!(resolved.permission.mode, PermissionMode::FullAuto);
        assert_eq!(
            resolved.env_overrides.model_id.as_deref(),
            Some("env-model")
        );
        assert_eq!(
            resolved.env_overrides.permission_mode,
            Some(PermissionMode::FullAuto)
        );

        clear_runtime_override_env();
    }

    #[test]
    fn upgrade_config_bundle_rejects_legacy_v1_shape() {
        let raw = serde_json::json!({
            "schema_version": 1,
            "theme": "dark"
        });

        let error = upgrade_config_bundle(raw).expect_err("legacy v1 shape should be rejected");
        assert!(error.contains("Unsupported config schema version"));
    }

    #[test]
    fn validate_config_bundle_rejects_missing_prompt_refs() {
        let mut bundle = ConfigBundle::default();
        bundle.prompts.fragments.clear();
        bundle.agents.items = vec![AgentDefinitionConfig {
            id: "custom".to_string(),
            label: "Custom".to_string(),
            description: "broken".to_string(),
            kinds: vec![AgentConfigKind::Primary],
            prompt_refs: vec!["missing.fragment".to_string()],
            model: AgentModelConfig::default(),
            permissions: AgentPermissions::default(),
            execution: AgentExecutionConfig::default(),
            max_turns: None,
        }];
        bundle.agents.default_agent_id = "custom".to_string();

        let errors = validate_config_bundle(&bundle).expect_err("bundle should be invalid");
        assert!(errors
            .iter()
            .any(|error| error.contains("missing prompt fragment")));
    }

    #[test]
    fn resolve_llm_config_defaults_history_tool_policy_to_preserve() {
        let mut settings = ConfigBundle::default();
        settings.models.providers = vec![ProviderConfig {
            id: "legacy-anthropic".to_string(),
            name: "Legacy Anthropic".to_string(),
            provider: "anthropic".to_string(),
            base_url: "https://example.com".to_string(),
            api_key: "key".to_string(),
            capabilities: ProviderCapabilities {
                anthropic_extended_thinking: Some(false),
                anthropic_beta_headers: Some(false),
                history_tool_results: None,
                history_tool_result_tools: None,
            },
            models: vec![ProviderModelConfig {
                id: "legacy-model".to_string(),
                name: "legacy-model".to_string(),
                enabled: true,
                note: None,
                capabilities: ModelCapabilities {
                    anthropic_extended_thinking: Some(false),
                    anthropic_beta_headers: Some(false),
                    history_tool_results: None,
                    history_tool_result_tools: None,
                },
            }],
        }];

        let resolved = resolve_llm_config(&settings, Some("legacy-anthropic"), None)
            .expect("llm config should resolve");

        assert_eq!(
            resolved.capabilities.history_tool_results,
            Some(HistoryToolResultsMode::Preserve)
        );
    }

    #[test]
    fn resolve_llm_config_preserves_explicit_history_tool_policy() {
        let mut settings = ConfigBundle::default();
        settings.models.providers = vec![ProviderConfig {
            id: "explicit-anthropic".to_string(),
            name: "Explicit Anthropic".to_string(),
            provider: "anthropic".to_string(),
            base_url: "https://example.com".to_string(),
            api_key: "key".to_string(),
            capabilities: ProviderCapabilities {
                anthropic_extended_thinking: Some(false),
                anthropic_beta_headers: Some(false),
                history_tool_results: Some(HistoryToolResultsMode::AllowList),
                history_tool_result_tools: Some(vec!["list_dir".to_string()]),
            },
            models: vec![ProviderModelConfig {
                id: "explicit-model".to_string(),
                name: "explicit-model".to_string(),
                enabled: true,
                note: None,
                capabilities: ModelCapabilities::default(),
            }],
        }];

        let resolved = resolve_llm_config(&settings, Some("explicit-anthropic"), None)
            .expect("llm config should resolve");

        assert_eq!(
            resolved.capabilities.history_tool_results,
            Some(HistoryToolResultsMode::AllowList)
        );
        assert_eq!(
            resolved.capabilities.history_tool_result_tools,
            Some(vec!["list_dir".to_string()])
        );
    }

    #[test]
    fn resolve_llm_config_canonicalizes_drop_to_preserve() {
        let mut settings = ConfigBundle::default();
        settings.models.providers = vec![ProviderConfig {
            id: "drop-config".to_string(),
            name: "Drop Config".to_string(),
            provider: "anthropic".to_string(),
            base_url: "https://example.com".to_string(),
            api_key: "key".to_string(),
            capabilities: ProviderCapabilities {
                anthropic_extended_thinking: Some(false),
                anthropic_beta_headers: Some(false),
                history_tool_results: Some(HistoryToolResultsMode::Drop),
                history_tool_result_tools: Some(vec!["plan_tasks".to_string()]),
            },
            models: vec![ProviderModelConfig {
                id: "drop-model".to_string(),
                name: "drop-model".to_string(),
                enabled: true,
                note: None,
                capabilities: ModelCapabilities::default(),
            }],
        }];

        let resolved = resolve_llm_config(&settings, Some("drop-config"), None)
            .expect("llm config should resolve");

        assert_eq!(
            resolved.capabilities.history_tool_results,
            Some(HistoryToolResultsMode::Preserve)
        );
        assert_eq!(resolved.capabilities.history_tool_result_tools, None);
    }
}
