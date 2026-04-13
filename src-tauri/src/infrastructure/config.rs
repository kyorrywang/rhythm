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
                history_tool_results: Some(HistoryToolResultsMode::Drop),
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
    #[serde(default)]
    pub mode: String,
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
                        history_tool_results: Some(HistoryToolResultsMode::Drop),
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
    let path = paths::get_settings_path();

    if !path.exists() {
        return create_default_config(&path);
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[config] Failed to read config bundle: {}", e);
            return create_default_config(&path);
        }
    };

    let raw_value = match serde_json::from_str::<serde_json::Value>(&content) {
        Ok(value) => value,
        Err(e) => {
            eprintln!(
                "[config] Failed to parse config bundle, using defaults: {}",
                e
            );
            return create_default_config(&path);
        }
    };

    let (mut bundle, migrated) = match upgrade_config_bundle(raw_value) {
        Ok(result) => result,
        Err(error) => {
            eprintln!("[config] Failed to upgrade config bundle: {}", error);
            let bundle = create_default_config(&path);
            let _ = save_config_bundle(&bundle);
            return bundle;
        }
    };

    let normalized = normalize_config_bundle(&mut bundle);
    let agent_definitions = match crate::agents::load_all_agent_definitions() {
        Ok(definitions) => definitions,
        Err(error) => {
            eprintln!("[config] Failed to load agent definitions: {}", error);
            crate::agents::default_agent_definitions()
        }
    };
    crate::agents::merge_agent_definitions_into_settings(&mut bundle, &agent_definitions);
    if let Err(errors) = validate_config_bundle(&bundle) {
        eprintln!(
            "[config] Invalid config bundle; restoring defaults:\n{}",
            errors.join("\n")
        );
        let bundle = create_default_config(&path);
        let _ = save_config_bundle(&bundle);
        return bundle;
    }

    if migrated || normalized {
        let _ = save_config_bundle(&bundle);
    }

    bundle
}

pub fn load_settings() -> ConfigBundle {
    load_config_bundle()
}

fn create_default_config(path: &std::path::Path) -> ConfigBundle {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut bundle = ConfigBundle::default();
    normalize_config_bundle(&mut bundle);
    if let Ok(agent_definitions) = crate::agents::load_all_agent_definitions() {
        crate::agents::merge_agent_definitions_into_settings(&mut bundle, &agent_definitions);
    }

    if let Err(e) = save_config_bundle(&bundle) {
        eprintln!("[config] Failed to write config bundle: {}", e);
    }

    bundle
}

fn cleanup_legacy_config_path() {
    let legacy_path = paths::get_legacy_config_path();
    if legacy_path.exists() {
        let _ = fs::remove_file(&legacy_path);
    }
    if let Some(parent) = legacy_path.parent() {
        if parent
            .file_name()
            .and_then(|segment| segment.to_str())
            == Some("config")
        {
            let _ = fs::remove_dir(parent);
        }
    }
}

fn upgrade_config_bundle(raw_value: serde_json::Value) -> Result<(ConfigBundle, bool), String> {
    let version = raw_value
        .get("schema_version")
        .and_then(|value| value.as_u64())
        .or_else(|| raw_value.get("schemaVersion").and_then(|value| value.as_u64()))
        .unwrap_or(default_schema_version() as u64);

    match version {
        2 => {
            let bundle: ConfigBundle =
                serde_json::from_value(raw_value).map_err(|e| format!("config bundle parse failed: {e}"))?;
            Ok((bundle, false))
        }
        other => Err(format!("Unsupported config schema version: {}", other)),
    }
}

fn validate_config_bundle(bundle: &ConfigBundle) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();

    if bundle.schema_version != default_schema_version() {
        errors.push(format!(
            "schema_version must be {}, got {}",
            default_schema_version(),
            bundle.schema_version
        ));
    }

    let primary_agents = primary_agents(bundle);
    let subagent_agents = subagent_agents(bundle);

    if primary_agents.is_empty() {
        errors.push("agents.items must contain at least one primary agent".to_string());
    }

    let mut seen_agent_ids = std::collections::HashSet::new();
    let permission_policy_ids = bundle
        .policies
        .catalog
        .permission
        .iter()
        .map(|policy| policy.id.to_lowercase())
        .collect::<std::collections::HashSet<_>>();
    let delegation_policy_ids = bundle
        .policies
        .catalog
        .delegation
        .iter()
        .map(|policy| policy.id.to_lowercase())
        .collect::<std::collections::HashSet<_>>();
    let review_policy_ids = bundle
        .policies
        .catalog
        .review
        .iter()
        .map(|policy| policy.id.to_lowercase())
        .collect::<std::collections::HashSet<_>>();
    let completion_policy_ids = bundle
        .policies
        .catalog
        .completion
        .iter()
        .map(|policy| policy.id.to_lowercase())
        .collect::<std::collections::HashSet<_>>();
    let observability_policy_ids = bundle
        .policies
        .catalog
        .observability
        .iter()
        .map(|policy| policy.id.to_lowercase())
        .collect::<std::collections::HashSet<_>>();
    let limit_policy_ids = bundle
        .policies
        .catalog
        .limits
        .iter()
        .map(|policy| policy.id.to_lowercase())
        .collect::<std::collections::HashSet<_>>();
    if permission_policy_ids.len() != bundle.policies.catalog.permission.len() {
        errors.push("duplicate permission policy id detected".to_string());
    }
    if delegation_policy_ids.len() != bundle.policies.catalog.delegation.len() {
        errors.push("duplicate delegation policy id detected".to_string());
    }
    if review_policy_ids.len() != bundle.policies.catalog.review.len() {
        errors.push("duplicate review policy id detected".to_string());
    }
    if completion_policy_ids.len() != bundle.policies.catalog.completion.len() {
        errors.push("duplicate completion policy id detected".to_string());
    }
    if observability_policy_ids.len() != bundle.policies.catalog.observability.len() {
        errors.push("duplicate observability policy id detected".to_string());
    }
    if limit_policy_ids.len() != bundle.policies.catalog.limits.len() {
        errors.push("duplicate limit policy id detected".to_string());
    }
    for agent in &bundle.agents.items {
        if agent.id.trim().is_empty() {
            errors.push("agents.items contains an empty id".to_string());
        }
        if !seen_agent_ids.insert(agent.id.to_lowercase()) {
            errors.push(format!("duplicate agent id '{}'", agent.id));
        }
        for prompt_ref in &agent.prompt_refs {
            if !bundle.prompts.fragments.contains_key(prompt_ref) {
                errors.push(format!(
                    "agent '{}' references missing prompt fragment '{}'",
                    agent.id, prompt_ref
                ));
            }
        }
        if has_agent_kind(agent, AgentConfigKind::Primary) {
            if let Some(policy_id) = &agent.execution.delegation_policy_ref {
                if !delegation_policy_ids.contains(&policy_id.to_lowercase()) {
                    errors.push(format!(
                        "agent '{}' references missing delegation policy '{}'",
                        agent.id, policy_id
                    ));
                }
            }
            if let Some(policy_id) = &agent.execution.review_policy_ref {
                if !review_policy_ids.contains(&policy_id.to_lowercase()) {
                    errors.push(format!(
                        "agent '{}' references missing review policy '{}'",
                        agent.id, policy_id
                    ));
                }
            }
            if let Some(policy_id) = &agent.execution.completion_policy_ref {
                if !completion_policy_ids.contains(&policy_id.to_lowercase()) {
                    errors.push(format!(
                        "agent '{}' references missing completion policy '{}'",
                        agent.id, policy_id
                    ));
                }
            }
            if let Some(policy_id) = &agent.execution.observability_policy_ref {
                if !observability_policy_ids.contains(&policy_id.to_lowercase()) {
                    errors.push(format!(
                        "agent '{}' references missing observability policy '{}'",
                        agent.id, policy_id
                    ));
                }
            }
            if let Some(policy_id) = &agent.execution.limit_policy_ref {
                if !limit_policy_ids.contains(&policy_id.to_lowercase()) {
                    errors.push(format!(
                        "agent '{}' references missing limit policy '{}'",
                        agent.id, policy_id
                    ));
                }
            }
            for delegate_agent_id in &agent.execution.available_delegate_agent_ids {
                if !subagent_agents
                    .iter()
                    .any(|subagent| subagent.id.eq_ignore_ascii_case(delegate_agent_id))
                {
                    errors.push(format!(
                        "agent '{}' references missing subagent '{}'",
                        agent.id, delegate_agent_id
                    ));
                }
            }
        }
    }

    if !primary_agents
        .iter()
        .any(|agent| agent.id.eq_ignore_ascii_case(&bundle.agents.default_agent_id))
    {
        errors.push(format!(
            "default agent '{}' does not exist",
            bundle.agents.default_agent_id
        ));
    }

    for (group, tools) in &bundle.tools.groups {
        for tool in tools {
            if !bundle.tools.registry.contains_key(tool) {
                errors.push(format!(
                    "tool group '{}' references unknown tool '{}'",
                    group, tool
                ));
            }
        }
    }

    let mut seen_provider_ids = std::collections::HashSet::new();
    for provider in &bundle.models.providers {
        if provider.id.trim().is_empty() {
            errors.push("models.providers contains an empty provider id".to_string());
        }
        if !seen_provider_ids.insert(provider.id.to_lowercase()) {
            errors.push(format!("duplicate provider id '{}'", provider.id));
        }
        if provider.models.is_empty() {
            errors.push(format!("provider '{}' must define at least one model", provider.id));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn normalize_config_bundle(bundle: &mut ConfigBundle) -> bool {
    let mut changed = false;
    changed |= normalize_provider_settings(bundle);
    changed |= normalize_prompt_settings(bundle);
    changed |= normalize_policy_settings(bundle);
    changed |= normalize_agent_settings(bundle);
    changed
}

fn normalize_policy_settings(bundle: &mut ConfigBundle) -> bool {
    let _ = bundle;
    false
}

fn read_runtime_env_overrides() -> RuntimeEnvironmentOverrides {
    let mut overrides = RuntimeEnvironmentOverrides::default();

    if let Ok(model) = std::env::var("RHYTHM_MODEL_OVERRIDE") {
        let trimmed = model.trim();
        if !trimmed.is_empty() {
            overrides.model_id = Some(trimmed.to_string());
        }
    }

    if let Ok(mode) = std::env::var("RHYTHM_PERMISSION_MODE_OVERRIDE") {
        let trimmed = mode.trim();
        if !trimmed.is_empty() {
            overrides.permission_mode = Some(PermissionMode::from_str(trimmed));
        }
    }

    if let Ok(agent_definition_id) = std::env::var("RHYTHM_AGENT_DEFINITION_ID") {
        let trimmed = agent_definition_id.trim();
        if !trimmed.is_empty() {
            overrides.agent_definition_id = Some(trimmed.to_string());
        }
    }

    overrides
}

/// Persist the current config bundle to disk.
pub fn save_config_bundle(bundle: &ConfigBundle) -> Result<(), String> {
    let path = paths::get_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut normalized = bundle.clone();
    normalize_config_bundle(&mut normalized);
    validate_config_bundle(&normalized).map_err(|errors| errors.join("\n"))?;
    let mut persisted = normalized.clone();
    let agent_definitions = crate::agents::load_all_agent_definitions()
        .unwrap_or_else(|_| crate::agents::default_agent_definitions());
    crate::agents::strip_agent_data_from_settings(&mut persisted, &agent_definitions);
    let json = serde_json::to_string_pretty(&persisted).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    cleanup_legacy_config_path();
    Ok(())
}

pub fn save_settings(settings: &ConfigBundle) -> Result<(), String> {
    save_config_bundle(settings)
}

pub fn resolve_llm_config(
    settings: &RhythmSettings,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> Result<LlmConfig, String> {
    if settings.models.providers.is_empty() {
        let mut resolved = LlmConfig::default();
        resolved.max_tokens = settings.models.defaults.max_tokens;
        if let Some(model) = model_id.map(str::trim).filter(|value| !value.is_empty()) {
            resolved.model = model.to_string();
        }
        return Ok(resolved);
    }

    let provider = if let Some(provider_id) = provider_id.map(str::trim).filter(|value| !value.is_empty()) {
        settings
            .models
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
        max_tokens: settings.models.defaults.max_tokens,
        capabilities: apply_provider_capability_defaults(
            &provider.provider,
            merge_model_capabilities(&provider.capabilities, &model.capabilities),
        ),
    })
}

fn normalize_provider_settings(settings: &mut ConfigBundle) -> bool {
    let mut changed = false;
    if settings.models.providers.is_empty() {
        settings.models.providers = ConfigBundle::default().models.providers;
        changed = true;
    }

    for provider in &mut settings.models.providers {
        if provider.models.is_empty() {
            provider.models.push(ProviderModelConfig {
                id: provider.name.clone(),
                name: provider.name.clone(),
                enabled: true,
                note: None,
                capabilities: ModelCapabilities::default(),
            });
            changed = true;
        }
        if !provider.models.iter().any(|model| model.enabled) {
            if let Some(first) = provider.models.first_mut() {
                first.enabled = true;
                changed = true;
            }
        }
    }

    if settings.models.defaults.reasoning.trim().is_empty() {
        settings.models.defaults.reasoning = default_reasoning();
        changed = true;
    }

    changed
}

fn normalize_prompt_settings(settings: &mut ConfigBundle) -> bool {
    let _ = settings;
    false
}

fn normalize_agent_settings(settings: &mut ConfigBundle) -> bool {
    let mut changed = false;
    if settings.agents.default_agent_id.trim().is_empty() {
        settings.agents.default_agent_id = default_agent_id();
        changed = true;
    }

    for agent in &mut settings.agents.items {
        if agent.kinds.is_empty() {
            agent.kinds.push(AgentConfigKind::Primary);
            changed = true;
        }
    }

    changed
}

pub fn list_primary_agents(settings: &RhythmSettings) -> Vec<AgentDefinitionConfig> {
    primary_agents(settings)
}

pub fn list_subagent_agents(settings: &RhythmSettings) -> Vec<AgentDefinitionConfig> {
    subagent_agents(settings)
}

fn fallback_agent_definition(agent_id: &str) -> Option<crate::agents::AgentDefinition> {
    crate::agents::default_agent_definitions()
        .into_iter()
        .find(|definition| definition.id().eq_ignore_ascii_case(agent_id))
}

fn fallback_primary_agent(agent_id: &str) -> Option<AgentDefinitionConfig> {
    fallback_agent_definition(agent_id).and_then(|definition| {
        definition.primary_agent().cloned().map(|mut agent| {
            agent.kinds = vec![AgentConfigKind::Primary];
            agent
        })
    })
}

fn fallback_subagent_agent(agent_id: &str) -> Option<AgentDefinitionConfig> {
    crate::agents::default_agent_definitions()
        .into_iter()
        .find(|definition| definition.id().eq_ignore_ascii_case(agent_id))
        .and_then(|definition| {
            definition.delegated_agent().cloned().map(|mut agent| {
                agent.kinds = vec![AgentConfigKind::Subagent];
                agent
            })
        })
}

pub fn resolve_subagent_definition(
    settings: &RhythmSettings,
    subagent_id: &str,
) -> Option<AgentDefinitionConfig> {
    subagent_agents(settings)
        .iter()
        .find(|subagent| subagent.id.eq_ignore_ascii_case(subagent_id))
        .cloned()
        .or_else(|| fallback_subagent_agent(subagent_id))
}

pub fn resolve_delegate_agents(
    settings: &RhythmSettings,
    agent: &AgentDefinitionConfig,
) -> Vec<AgentDefinitionConfig> {
    agent
        .execution
        .available_delegate_agent_ids
        .iter()
        .filter_map(|subagent_id| resolve_subagent_definition(settings, subagent_id))
        .collect()
}

pub fn render_prompt_fragments(settings: &RhythmSettings, prompt_refs: &[String]) -> String {
    prompt_refs
        .iter()
        .filter_map(|prompt_ref| settings.prompts.fragments.get(prompt_ref))
        .filter(|fragment| !fragment.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub fn resolve_agent_definition(
    settings: &RhythmSettings,
    agent_id: Option<&str>,
) -> AgentDefinitionConfig {
    let requested = agent_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&settings.agents.default_agent_id);

    settings
        .agents
        .items
        .iter()
        .find(|agent| agent.id.eq_ignore_ascii_case(requested))
        .cloned()
        .or_else(|| fallback_agent_definition(requested).map(|definition| definition.agent.clone()))
        .or_else(|| {
            settings
                .agents
                .items
                .iter()
                .find(|agent| agent.id.eq_ignore_ascii_case("chat"))
                .cloned()
        })
        .unwrap_or_else(|| {
            fallback_primary_agent("chat")
                .unwrap_or(AgentDefinitionConfig {
                    id: "chat".to_string(),
                    label: "Chat".to_string(),
                    mode: "Chat".to_string(),
                    description: "Chat".to_string(),
                    kinds: vec![AgentConfigKind::Primary],
                    prompt_refs: vec![],
                    model: AgentModelConfig::default(),
                    permissions: AgentPermissions::default(),
                    execution: AgentExecutionConfig::default(),
                    max_turns: None,
                })
        })
}

fn resolve_permission_policy(
    settings: &RhythmSettings,
    agent: &AgentDefinitionConfig,
) -> Option<PermissionPolicyDefinition> {
    settings
        .policies
        .catalog
        .permission
        .iter()
        .find(|policy| {
            agent.permissions.locked == policy.locked
                && agent
                    .permissions
                    .default_mode
                    .as_ref()
                    == Some(&policy.mode)
                && agent.permissions.allowed_tools == policy.allowed_tools
                && agent.permissions.disallowed_tools == policy.denied_tools
        })
        .cloned()
        .or_else(|| {
            fallback_agent_definition(&agent.id).and_then(|definition| {
                definition.policies().and_then(|policies| {
                    policies.permission.iter().find(|policy| {
                        policy.locked == agent.permissions.locked
                            && agent.permissions.default_mode.as_ref() == Some(&policy.mode)
                            && agent.permissions.allowed_tools == policy.allowed_tools
                            && agent.permissions.disallowed_tools == policy.denied_tools
                    }).cloned()
                })
            })
        })
}

fn resolve_delegation_policy(
    settings: &RhythmSettings,
    agent: &AgentDefinitionConfig,
) -> ResolvedDelegationPolicy {
    let policy = agent
        .execution
        .delegation_policy_ref
        .as_deref()
        .and_then(|id| {
            settings
                .policies
                .catalog
                .delegation
                .iter()
                .find(|policy| policy.id.eq_ignore_ascii_case(id))
        })
        .cloned()
        .or_else(|| {
            fallback_agent_definition(&agent.id).and_then(|definition| {
                agent
                    .execution
                    .delegation_policy_ref
                    .as_deref()
                    .and_then(|id| {
                        definition.policies().and_then(|policies| {
                            policies
                                .delegation
                                .iter()
                                .find(|policy| policy.id.eq_ignore_ascii_case(id))
                                .cloned()
                        })
                    })
            })
        });

    match policy {
        Some(policy) => ResolvedDelegationPolicy {
            id: Some(policy.id),
            enabled: policy.enabled,
            root_may_execute: policy.root_may_execute,
            max_subagents_per_turn: policy.max_subagents_per_turn,
        },
        None => ResolvedDelegationPolicy {
            id: None,
            enabled: true,
            root_may_execute: true,
            max_subagents_per_turn: None,
        },
    }
}

fn resolve_review_policy(
    settings: &RhythmSettings,
    agent: &AgentDefinitionConfig,
) -> ResolvedReviewPolicy {
    let policy = agent
        .execution
        .review_policy_ref
        .as_deref()
        .and_then(|id| {
            settings
                .policies
                .catalog
                .review
                .iter()
                .find(|policy| policy.id.eq_ignore_ascii_case(id))
        })
        .cloned()
        .or_else(|| {
            fallback_agent_definition(&agent.id).and_then(|definition| {
                agent.execution.review_policy_ref.as_deref().and_then(|id| {
                    definition.policies().and_then(|policies| {
                        policies
                            .review
                            .iter()
                            .find(|policy| policy.id.eq_ignore_ascii_case(id))
                            .cloned()
                    })
                })
            })
        });
    match policy {
        Some(policy) => ResolvedReviewPolicy {
            id: Some(policy.id),
            required: policy.required,
            human_checkpoint_required: policy.human_checkpoint_required,
        },
        None => ResolvedReviewPolicy {
            id: None,
            required: false,
            human_checkpoint_required: false,
        },
    }
}

fn resolve_completion_policy(
    settings: &RhythmSettings,
    agent: &AgentDefinitionConfig,
) -> ResolvedCompletionPolicy {
    let policy = agent
        .execution
        .completion_policy_ref
        .as_deref()
        .and_then(|id| {
            settings
                .policies
                .catalog
                .completion
                .iter()
                .find(|policy| policy.id.eq_ignore_ascii_case(id))
        })
        .cloned()
        .or_else(|| {
            fallback_agent_definition(&agent.id).and_then(|definition| {
                agent
                    .execution
                    .completion_policy_ref
                    .as_deref()
                    .and_then(|id| {
                        definition.policies().and_then(|policies| {
                            policies
                                .completion
                                .iter()
                                .find(|policy| policy.id.eq_ignore_ascii_case(id))
                                .cloned()
                        })
                    })
            })
        });
    match policy {
        Some(policy) => ResolvedCompletionPolicy {
            id: Some(policy.id),
            strategy: policy.strategy,
        },
        None => ResolvedCompletionPolicy {
            id: None,
            strategy: "direct_answer".to_string(),
        },
    }
}

fn resolve_observability_policy(
    settings: &RhythmSettings,
    agent: &AgentDefinitionConfig,
) -> ResolvedObservabilityPolicy {
    let policy = agent
        .execution
        .observability_policy_ref
        .as_deref()
        .and_then(|id| {
            settings
                .policies
                .catalog
                .observability
                .iter()
                .find(|policy| policy.id.eq_ignore_ascii_case(id))
        })
        .cloned()
        .or_else(|| {
            fallback_agent_definition(&agent.id).and_then(|definition| {
                agent
                    .execution
                    .observability_policy_ref
                    .as_deref()
                    .and_then(|id| {
                        definition.policies().and_then(|policies| {
                            policies
                                .observability
                                .iter()
                                .find(|policy| policy.id.eq_ignore_ascii_case(id))
                                .cloned()
                        })
                    })
            })
        });
    match policy {
        Some(policy) => ResolvedObservabilityPolicy {
            id: Some(policy.id),
            capture_resolved_spec: policy.capture_resolved_spec,
            capture_provenance: policy.capture_provenance,
        },
        None => ResolvedObservabilityPolicy {
            id: None,
            capture_resolved_spec: true,
            capture_provenance: true,
        },
    }
}

fn resolve_limit_policy_agent_turn_limit(settings: &RhythmSettings, agent: &AgentDefinitionConfig) -> Option<usize> {
    agent
        .execution
        .limit_policy_ref
        .as_deref()
        .and_then(|id| {
            settings
                .policies
                .catalog
                .limits
                .iter()
                .find(|policy| policy.id.eq_ignore_ascii_case(id))
        })
        .and_then(|policy| policy.agent_turn_limit)
        .or_else(|| {
            fallback_agent_definition(&agent.id).and_then(|definition| {
                agent.execution.limit_policy_ref.as_deref().and_then(|id| {
                    definition.policies().and_then(|policies| {
                        policies
                            .limits
                            .iter()
                            .find(|policy| policy.id.eq_ignore_ascii_case(id))
                            .and_then(|policy| policy.agent_turn_limit)
                    })
                })
            })
        })
}

pub fn should_delegate_task(
    runtime_spec: &ResolvedAgentSpec,
    prompt: &str,
    _attachment_count: usize,
) -> bool {
    if runtime_spec.completion.strategy != "delegate_then_summarize" {
        return false;
    }

    let policy = &runtime_spec.delegation;
    if !policy.enabled {
        return false;
    }

    if prompt.trim().is_empty() {
        return false;
    }

    !policy.root_may_execute
}

pub fn resolve_runtime_spec(
    settings: &RhythmSettings,
    intent: RuntimeIntent,
) -> Result<ResolvedAgentSpec, String> {
    // Effective runtime precedence is:
    // 1. session intent overrides
    // 2. agent defaults / locked agent rules
    // 3. environment runtime overrides
    // 4. persisted config defaults
    let env_overrides = read_runtime_env_overrides();
    let requested_agent_id = intent
        .agent_id
        .as_deref()
        .or(env_overrides.agent_definition_id.as_deref());
    let agent = resolve_agent_definition(settings, requested_agent_id);
    let permission_policy = resolve_permission_policy(settings, &agent);
    let delegation = resolve_delegation_policy(settings, &agent);
    let review = resolve_review_policy(settings, &agent);
    let completion = resolve_completion_policy(settings, &agent);
    let observability = resolve_observability_policy(settings, &agent);
    let resolved_agent_id = agent.id.clone();
    let delegation_policy_source = agent
        .execution
        .delegation_policy_ref
        .clone()
        .unwrap_or_else(|| "inline_default".to_string());
    let review_policy_source = agent
        .execution
        .review_policy_ref
        .clone()
        .unwrap_or_else(|| "inline_default".to_string());
    let completion_policy_source = agent
        .execution
        .completion_policy_ref
        .clone()
        .unwrap_or_else(|| "inline_default".to_string());
    let observability_policy_source = agent
        .execution
        .observability_policy_ref
        .clone()
        .unwrap_or_else(|| "inline_default".to_string());
    let provider_id = intent
        .provider_id
        .as_deref()
        .or(agent.model.provider_id.as_deref());
    let model_id = intent
        .model_id
        .as_deref()
        .or(agent.model.model_id.as_deref());
    let effective_model_id = model_id.or(env_overrides.model_id.as_deref());
    let llm = resolve_llm_config(settings, provider_id, effective_model_id)?;
    let provider_source = if intent.provider_id.is_some() {
        "intent.provider_id"
    } else if agent.model.provider_id.is_some() {
        "agent.model.provider_id"
    } else {
        "models.providers.default"
    };
    let model_source = if intent.model_id.is_some() {
        "intent.model_id"
    } else if agent.model.model_id.is_some() {
        "agent.model.model_id"
    } else if env_overrides.model_id.is_some() {
        "env.RHYTHM_MODEL_OVERRIDE"
    } else {
        "models.providers.default_model"
    };

    let permission = PermissionConfig {
        mode: if agent.permissions.locked {
            agent
                .permissions
                .default_mode
                .clone()
                .or(intent.permission_mode.clone())
                .or(env_overrides.permission_mode.clone())
                .unwrap_or_else(|| {
                    permission_policy
                        .as_ref()
                        .map(|policy| policy.mode.clone())
                        .unwrap_or_else(|| settings.policies.permissions.mode.clone())
                })
        } else {
            intent
                .permission_mode
                .clone()
                .or(agent.permissions.default_mode.clone())
                .or(env_overrides.permission_mode.clone())
                .unwrap_or_else(|| {
                    permission_policy
                        .as_ref()
                        .map(|policy| policy.mode.clone())
                        .unwrap_or_else(|| settings.policies.permissions.mode.clone())
                })
        },
        allowed_tools: if agent.permissions.locked {
            agent.permissions.allowed_tools.clone()
        } else {
            intent
                .allowed_tools
                .clone()
                .unwrap_or_else(|| {
                    permission_policy
                        .as_ref()
                        .map(|policy| policy.allowed_tools.clone())
                        .unwrap_or_else(|| settings.policies.permissions.allowed_tools.clone())
                })
        },
        denied_tools: if agent.permissions.locked {
            agent.permissions.disallowed_tools.clone()
        } else {
            intent
                .disallowed_tools
                .clone()
                .unwrap_or_else(|| {
                    permission_policy
                        .as_ref()
                        .map(|policy| policy.denied_tools.clone())
                        .unwrap_or_else(|| settings.policies.permissions.denied_tools.clone())
                })
        },
        path_rules: settings.policies.permissions.path_rules.clone(),
        denied_commands: settings.policies.permissions.denied_commands.clone(),
    };
    let mut env_applied = Vec::new();
    if env_overrides.model_id.is_some() {
        env_applied.push("RHYTHM_MODEL_OVERRIDE".to_string());
    }
    if env_overrides.permission_mode.is_some() {
        env_applied.push("RHYTHM_PERMISSION_MODE_OVERRIDE".to_string());
    }
    if env_overrides.agent_definition_id.is_some() {
        env_applied.push("RHYTHM_AGENT_DEFINITION_ID".to_string());
    }
    let reasoning = intent
        .reasoning
        .clone()
        .or(agent.model.reasoning.clone())
        .or_else(|| Some(settings.models.defaults.reasoning.clone()));
    let reasoning_source = if intent.reasoning.is_some() {
        "intent.reasoning"
    } else if agent.model.reasoning.is_some() {
        "agent.model.reasoning"
    } else {
        "models.defaults.reasoning"
    };
    let agent_turn_limit = agent
        .execution
        .agent_turn_limit
        .or(resolve_limit_policy_agent_turn_limit(settings, &agent))
        .or(env_overrides.agent_turn_limit)
        .or(settings.policies.runtime.agent_turn_limit);
    let delegate_agents = resolve_delegate_agents(settings, &agent);
    let limit_policy_source = if agent.execution.agent_turn_limit.is_some() {
        "agent.execution.agent_turn_limit"
    } else if agent.execution.limit_policy_ref.is_some() {
        "agent.execution.limit_policy_ref"
    } else if env_overrides.agent_turn_limit.is_some() {
        "env.RHYTHM_AGENT_TURN_LIMIT"
    } else {
        "policies.runtime.agent_turn_limit"
    };
    let permission_policy_source = if agent.permissions.locked {
        "agent.permissions.locked"
    } else if intent.permission_mode.is_some() || intent.allowed_tools.is_some() || intent.disallowed_tools.is_some() {
        "intent.permission_override"
    } else if env_overrides.permission_mode.is_some() {
        "env.RHYTHM_PERMISSION_MODE_OVERRIDE"
    } else if let Some(policy) = &permission_policy {
        if policy.locked { "policies.catalog.permission" } else { "policies.catalog.permission" }
    } else {
        "policies.permissions"
    };

    Ok(ResolvedAgentSpec {
        prompt_refs: agent.prompt_refs.clone(),
        reasoning,
        agent_turn_limit,
        delegate_agents,
        agent,
        llm,
        permission,
        delegation,
        review,
        completion,
        observability,
        provenance: RuntimeResolutionProvenance {
            agent_id: resolved_agent_id,
            provider_source: provider_source.to_string(),
            model_source: model_source.to_string(),
            reasoning_source: reasoning_source.to_string(),
            permission_policy_source: permission_policy_source.to_string(),
            delegation_policy_source,
            review_policy_source,
            completion_policy_source,
            observability_policy_source,
            limit_policy_source: limit_policy_source.to_string(),
            env_overrides_applied: env_applied,
        },
        env_overrides,
    })
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

        assert_eq!(settings.models.providers[0].models[0].name, "claude-opus-4-5");
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
            mode: "Chat".to_string(),
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
        assert_eq!(resolved.env_overrides.model_id.as_deref(), Some("env-model"));
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
            mode: "Chat".to_string(),
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
        assert!(errors.iter().any(|error| error.contains("missing prompt fragment")));
    }

    #[test]
    fn should_delegate_task_marks_complex_coordinate_requests() {
        let _guard = runtime_env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        clear_runtime_override_env();
        let mut settings = ConfigBundle::default();
        settings.models.providers = vec![ProviderConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            provider: "openai".to_string(),
            base_url: "https://example.com".to_string(),
            api_key: "key".to_string(),
            capabilities: ProviderCapabilities::default(),
            models: vec![ProviderModelConfig {
                id: "test-model".to_string(),
                name: "test-model".to_string(),
                enabled: true,
                note: None,
                capabilities: ModelCapabilities::default(),
            }],
        }];
        normalize_config_bundle(&mut settings);
        let coordinate = resolve_runtime_spec(
            &settings,
            RuntimeIntent {
                agent_id: Some("coordinate".to_string()),
                provider_id: Some("test".to_string()),
                model_id: None,
                reasoning: None,
                permission_mode: None,
                allowed_tools: None,
                disallowed_tools: None,
            },
        )
        .expect("coordinate spec");
        let chat = resolve_runtime_spec(
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
        .expect("chat spec");

        assert!(!should_delegate_task(&coordinate, "写一本修仙小说大纲", 0));
        assert!(!should_delegate_task(&chat, "你好", 0));
        clear_runtime_override_env();
    }

    #[test]
    fn resolve_runtime_spec_resolves_policy_refs_and_provenance() {
        let _guard = runtime_env_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        clear_runtime_override_env();
        let mut settings = ConfigBundle::default();
        settings.models.providers = vec![ProviderConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            provider: "openai".to_string(),
            base_url: "https://example.com".to_string(),
            api_key: "key".to_string(),
            capabilities: ProviderCapabilities::default(),
            models: vec![ProviderModelConfig {
                id: "test-model".to_string(),
                name: "test-model".to_string(),
                enabled: true,
                note: None,
                capabilities: ModelCapabilities::default(),
            }],
        }];
        normalize_config_bundle(&mut settings);
        let resolved = resolve_runtime_spec(
            &settings,
            RuntimeIntent {
                agent_id: Some("coordinate".to_string()),
                provider_id: Some("test".to_string()),
                model_id: None,
                reasoning: None,
                permission_mode: None,
                allowed_tools: None,
                disallowed_tools: None,
            },
        )
        .expect("coordinate runtime spec should resolve");

        assert_eq!(resolved.delegation.id.as_deref(), Some("coordinate_delegate_only"));
        assert!(!resolved.delegation.root_may_execute);
        assert_eq!(resolved.completion.id.as_deref(), Some("direct_answer"));
        assert_eq!(resolved.observability.id.as_deref(), Some("standard"));
        assert_eq!(resolved.provenance.agent_id, "coordinate");
        assert_eq!(resolved.provenance.delegation_policy_source, "coordinate_delegate_only");
        clear_runtime_override_env();
    }

    #[test]
    fn resolve_llm_config_defaults_anthropic_history_tool_policy_for_legacy_settings() {
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
            Some(HistoryToolResultsMode::Drop)
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
        history_tool_results: model.history_tool_results.or(provider.history_tool_results),
        history_tool_result_tools: model
            .history_tool_result_tools
            .clone()
            .or(provider.history_tool_result_tools.clone()),
    }
}

fn apply_provider_capability_defaults(
    provider_kind: &str,
    mut capabilities: ModelCapabilities,
) -> ModelCapabilities {
    if provider_kind.eq_ignore_ascii_case("anthropic") {
        if capabilities.history_tool_results.is_none() {
            capabilities.history_tool_results = Some(HistoryToolResultsMode::Drop);
        }
    }

    capabilities
}

fn default_provider(settings: &RhythmSettings) -> Option<&ProviderConfig> {
    settings
        .models
        .providers
        .iter()
        .find(|provider| provider.enabled_for_runtime())
}

fn default_model(provider: &ProviderConfig) -> Option<&ProviderModelConfig> {
    provider
        .models
        .iter()
        .find(|model| model.enabled)
}

impl ProviderConfig {
    fn enabled_for_runtime(&self) -> bool {
        !self.base_url.trim().is_empty()
            && !self.api_key.trim().is_empty()
            && self.models.iter().any(|model| model.enabled)
    }
}

