use super::*;

pub(super) fn validate_config_bundle(bundle: &ConfigBundle) -> Result<(), Vec<String>> {
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

    if !primary_agents.iter().any(|agent| {
        agent
            .id
            .eq_ignore_ascii_case(&bundle.agents.default_agent_id)
    }) {
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
            errors.push(format!(
                "provider '{}' must define at least one model",
                provider.id
            ));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}
