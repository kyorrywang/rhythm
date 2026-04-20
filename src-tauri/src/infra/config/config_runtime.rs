use super::defaults::{default_agent_id, default_reasoning};
use super::*;
use crate::runtime::policy::permissions::modes::PermissionMode;

pub(super) fn normalize_config_bundle(bundle: &mut ConfigBundle) -> bool {
    let mut changed = false;
    changed |= normalize_provider_settings(bundle);
    changed |= normalize_prompt_settings(bundle);
    changed |= normalize_policy_settings(bundle);
    changed |= normalize_agent_settings(bundle);
    changed
}

pub(super) fn normalize_policy_settings(bundle: &mut ConfigBundle) -> bool {
    let _ = bundle;
    false
}

pub(super) fn read_runtime_env_overrides() -> RuntimeEnvironmentOverrides {
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

pub(super) fn resolve_llm_config(
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

    let provider = if let Some(provider_id) =
        provider_id.map(str::trim).filter(|value| !value.is_empty())
    {
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
        default_provider(settings).ok_or_else(|| "No enabled provider is configured".to_string())?
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

pub(super) fn normalize_provider_settings(settings: &mut ConfigBundle) -> bool {
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

pub(super) fn normalize_prompt_settings(settings: &mut ConfigBundle) -> bool {
    let _ = settings;
    false
}

pub(super) fn normalize_agent_settings(settings: &mut ConfigBundle) -> bool {
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

pub(super) fn fallback_agent_definition(
    agent_id: &str,
) -> Option<crate::runtime::agents::AgentDefinition> {
    crate::runtime::agents::default_agent_definitions()
        .into_iter()
        .find(|definition| definition.id().eq_ignore_ascii_case(agent_id))
}

pub(super) fn fallback_primary_agent(agent_id: &str) -> Option<AgentDefinitionConfig> {
    fallback_agent_definition(agent_id).and_then(|definition| {
        definition.primary_agent().cloned().map(|mut agent| {
            agent.kinds = vec![AgentConfigKind::Primary];
            agent
        })
    })
}

pub(super) fn fallback_subagent_agent(agent_id: &str) -> Option<AgentDefinitionConfig> {
    crate::runtime::agents::default_agent_definitions()
        .into_iter()
        .find(|definition| definition.id().eq_ignore_ascii_case(agent_id))
        .and_then(|definition| {
            definition.delegated_agent().cloned().map(|mut agent| {
                agent.kinds = vec![AgentConfigKind::Subagent];
                agent
            })
        })
}

pub(super) fn resolve_subagent_definition(
    settings: &RhythmSettings,
    subagent_id: &str,
) -> Option<AgentDefinitionConfig> {
    subagent_agents(settings)
        .iter()
        .find(|subagent| subagent.id.eq_ignore_ascii_case(subagent_id))
        .cloned()
        .or_else(|| fallback_subagent_agent(subagent_id))
}

pub(super) fn resolve_delegate_agents(
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

pub(super) fn render_prompt_fragments(settings: &RhythmSettings, prompt_refs: &[String]) -> String {
    prompt_refs
        .iter()
        .filter_map(|prompt_ref| settings.prompts.fragments.get(prompt_ref))
        .filter(|fragment| !fragment.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub(super) fn resolve_agent_definition(
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
            fallback_primary_agent("chat").unwrap_or(AgentDefinitionConfig {
                id: "chat".to_string(),
                label: "Chat".to_string(),
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

pub(super) fn resolve_permission_policy(
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
                && agent.permissions.default_mode.as_ref() == Some(&policy.mode)
                && agent.permissions.allowed_tools == policy.allowed_tools
                && agent.permissions.disallowed_tools == policy.denied_tools
        })
        .cloned()
        .or_else(|| {
            fallback_agent_definition(&agent.id).and_then(|definition| {
                definition.policies().and_then(|policies| {
                    policies
                        .permission
                        .iter()
                        .find(|policy| {
                            policy.locked == agent.permissions.locked
                                && agent.permissions.default_mode.as_ref() == Some(&policy.mode)
                                && agent.permissions.allowed_tools == policy.allowed_tools
                                && agent.permissions.disallowed_tools == policy.denied_tools
                        })
                        .cloned()
                })
            })
        })
}

pub(super) fn resolve_delegation_policy(
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

pub(super) fn resolve_review_policy(
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

pub(super) fn resolve_completion_policy(
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

pub(super) fn resolve_observability_policy(
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

pub(super) fn resolve_limit_policy_agent_turn_limit(
    settings: &RhythmSettings,
    agent: &AgentDefinitionConfig,
) -> Option<usize> {
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

pub(super) fn should_delegate_task(
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

pub(super) fn resolve_runtime_spec(
    settings: &RhythmSettings,
    intent: RuntimeIntent,
) -> Result<ResolvedAgentSpec, String> {
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
            intent.allowed_tools.clone().unwrap_or_else(|| {
                permission_policy
                    .as_ref()
                    .map(|policy| policy.allowed_tools.clone())
                    .unwrap_or_else(|| settings.policies.permissions.allowed_tools.clone())
            })
        },
        denied_tools: if agent.permissions.locked {
            agent.permissions.disallowed_tools.clone()
        } else {
            intent.disallowed_tools.clone().unwrap_or_else(|| {
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
    } else if intent.permission_mode.is_some()
        || intent.allowed_tools.is_some()
        || intent.disallowed_tools.is_some()
    {
        "intent.permission_override"
    } else if env_overrides.permission_mode.is_some() {
        "env.RHYTHM_PERMISSION_MODE_OVERRIDE"
    } else if permission_policy.is_some() {
        "policies.catalog.permission"
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

pub(super) fn merge_model_capabilities(
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

pub(super) fn apply_provider_capability_defaults(
    _provider_kind: &str,
    mut capabilities: ModelCapabilities,
) -> ModelCapabilities {
    capabilities.history_tool_results = Some(match capabilities.history_tool_results {
        Some(HistoryToolResultsMode::AllowList) => HistoryToolResultsMode::AllowList,
        _ => HistoryToolResultsMode::Preserve,
    });

    if capabilities.history_tool_results != Some(HistoryToolResultsMode::AllowList) {
        capabilities.history_tool_result_tools = None;
    }

    capabilities
}

pub(super) fn default_provider(settings: &RhythmSettings) -> Option<&ProviderConfig> {
    settings
        .models
        .providers
        .iter()
        .find(|provider| provider.enabled_for_runtime())
}

pub(super) fn default_model(provider: &ProviderConfig) -> Option<&ProviderModelConfig> {
    provider.models.iter().find(|model| model.enabled)
}

impl ProviderConfig {
    pub(super) fn enabled_for_runtime(&self) -> bool {
        !self.base_url.trim().is_empty()
            && !self.api_key.trim().is_empty()
            && self.models.iter().any(|model| model.enabled)
    }
}
