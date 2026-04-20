use crate::runtime::capabilities::mcp::types::McpServerConfig;
use crate::runtime::policy::permissions::modes::PermissionMode;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::defaults::*;

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

pub(super) fn primary_agents(settings: &RhythmSettings) -> Vec<AgentDefinitionConfig> {
    settings
        .agents
        .items
        .iter()
        .filter(|agent| has_agent_kind(agent, AgentConfigKind::Primary))
        .cloned()
        .collect()
}

pub(super) fn subagent_agents(settings: &RhythmSettings) -> Vec<AgentDefinitionConfig> {
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
