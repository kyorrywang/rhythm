#[path = "config_migration.rs"]
mod migration;
#[path = "config_runtime.rs"]
mod runtime;
#[path = "config_store.rs"]
mod store;
#[path = "config_validation.rs"]
mod validation;

mod defaults;
mod model;

pub use model::*;

#[cfg(test)]
use migration::upgrade_config_bundle;
#[cfg(test)]
use runtime::normalize_config_bundle;
#[cfg(test)]
use validation::validate_config_bundle;

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
    model::primary_agents(settings)
}

pub fn list_subagent_agents(settings: &RhythmSettings) -> Vec<AgentDefinitionConfig> {
    model::subagent_agents(settings)
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
    use crate::runtime::policy::permissions::PermissionMode;
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
