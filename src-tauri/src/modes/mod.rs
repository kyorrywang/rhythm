use crate::infrastructure::config::{
    CompletionPolicyDefinition, ConfigBundle, DelegationPolicyDefinition,
    LimitPolicyDefinition, ObservabilityPolicyDefinition,
    PermissionPolicyDefinition, ResolvedRuntimeSpec, ReviewPolicyDefinition, RuntimeProfile,
    RuntimeProfileExecution, RuntimeProfileModelConfig, RuntimeProfilePermissions,
    SubagentDefinition,
};
use crate::infrastructure::paths;
use crate::permissions::modes::PermissionMode;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;

const MODE_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModePolicyCatalog {
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ModeDefinition {
    Primary {
        #[serde(default = "default_mode_schema_version")]
        schema_version: u32,
        profile: RuntimeProfile,
        #[serde(default)]
        prompt_fragments: HashMap<String, String>,
        #[serde(default)]
        policies: ModePolicyCatalog,
    },
    Subagent {
        #[serde(default = "default_mode_schema_version")]
        schema_version: u32,
        agent: SubagentDefinition,
        #[serde(default)]
        prompt_fragments: HashMap<String, String>,
    },
}

impl ModeDefinition {
    pub fn id(&self) -> &str {
        match self {
            Self::Primary { profile, .. } => &profile.id,
            Self::Subagent { agent, .. } => &agent.id,
        }
    }

    pub fn profile(&self) -> &RuntimeProfile {
        match self {
            Self::Primary { profile, .. } => profile,
            Self::Subagent { .. } => panic!("subagent definitions do not expose primary profiles"),
        }
    }

    pub fn subagent(&self) -> Option<&SubagentDefinition> {
        match self {
            Self::Primary { .. } => None,
            Self::Subagent { agent, .. } => Some(agent),
        }
    }

    pub fn prompt_fragments(&self) -> &HashMap<String, String> {
        match self {
            Self::Primary {
                prompt_fragments, ..
            } => prompt_fragments,
            Self::Subagent {
                prompt_fragments, ..
            } => prompt_fragments,
        }
    }

    pub fn policies(&self) -> Option<&ModePolicyCatalog> {
        match self {
            Self::Primary { policies, .. } => Some(policies),
            Self::Subagent { .. } => None,
        }
    }
}

fn default_mode_schema_version() -> u32 {
    MODE_SCHEMA_VERSION
}

fn default_chat_mode() -> ModeDefinition {
    ModeDefinition::Primary {
        schema_version: MODE_SCHEMA_VERSION,
        profile: RuntimeProfile {
            id: "chat".to_string(),
            label: "Chat".to_string(),
            mode: "Chat".to_string(),
            description: "单 agent 普通对话".to_string(),
            prompt_refs: vec!["base.assistant".to_string()],
            model: RuntimeProfileModelConfig::default(),
            permissions: RuntimeProfilePermissions {
                locked: false,
                default_mode: None,
                allowed_tools: vec![],
                disallowed_tools: vec![],
            },
            execution: RuntimeProfileExecution {
                agent_turn_limit: None,
                delegation_policy_ref: Some("chat_flexible".to_string()),
                review_policy_ref: Some("chat_optional".to_string()),
                completion_policy_ref: Some("direct_answer".to_string()),
                observability_policy_ref: Some("standard".to_string()),
                limit_policy_ref: Some("default".to_string()),
                available_subagents: vec![
                    "explorer".to_string(),
                    "coder".to_string(),
                    "reviewer".to_string(),
                ],
            },
        },
        prompt_fragments: HashMap::from([(
            "base.assistant".to_string(),
            "You are operating in the Chat profile.\n\nDefault behaviour:\n1. Answer the user directly when you can.\n2. Use tools when they are available and genuinely helpful.\n3. Only delegate to subagents when it materially improves the result.".to_string(),
        )]),
        policies: ModePolicyCatalog {
            permission: vec![PermissionPolicyDefinition {
                id: "default".to_string(),
                mode: PermissionMode::Default,
                allowed_tools: vec![],
                denied_tools: vec![],
                locked: false,
            }],
            delegation: vec![DelegationPolicyDefinition {
                id: "chat_flexible".to_string(),
                enabled: true,
                root_may_execute: true,
                max_subagents_per_turn: None,
            }],
            review: vec![ReviewPolicyDefinition {
                id: "chat_optional".to_string(),
                required: false,
                human_checkpoint_required: false,
            }],
            completion: vec![CompletionPolicyDefinition {
                id: "direct_answer".to_string(),
                strategy: "direct_answer".to_string(),
            }],
            observability: vec![ObservabilityPolicyDefinition {
                id: "standard".to_string(),
                capture_resolved_spec: true,
                capture_provenance: true,
            }],
            limits: vec![LimitPolicyDefinition {
                id: "default".to_string(),
                agent_turn_limit: None,
            }],
        },
    }
}

fn default_coordinate_mode() -> ModeDefinition {
    ModeDefinition::Primary {
        schema_version: MODE_SCHEMA_VERSION,
        profile: RuntimeProfile {
            id: "coordinate".to_string(),
            label: "Coordinate".to_string(),
            mode: "Coordinate".to_string(),
            description: "多 agent 协同处理".to_string(),
            prompt_refs: vec![
                "base.coordinator".to_string(),
                "policy.no_direct_execution".to_string(),
            ],
            model: RuntimeProfileModelConfig {
                provider_id: None,
                model_id: None,
                reasoning: Some("high".to_string()),
            },
            permissions: RuntimeProfilePermissions {
                locked: true,
                default_mode: Some(PermissionMode::Plan),
                allowed_tools: vec![
                    "list_dir".to_string(),
                    "read".to_string(),
                    "spawn_subagent".to_string(),
                ],
                disallowed_tools: vec![
                    "write".to_string(),
                    "edit".to_string(),
                    "shell".to_string(),
                    "delete".to_string(),
                    "plan".to_string(),
                    "ask_user".to_string(),
                ],
            },
            execution: RuntimeProfileExecution {
                agent_turn_limit: None,
                delegation_policy_ref: Some("coordinate_delegate_only".to_string()),
                review_policy_ref: Some("coordinate_optional".to_string()),
                completion_policy_ref: Some("direct_answer".to_string()),
                observability_policy_ref: Some("standard".to_string()),
                limit_policy_ref: Some("default".to_string()),
                available_subagents: vec![
                    "explorer".to_string(),
                    "coder".to_string(),
                    "reviewer".to_string(),
                ],
            },
        },
        prompt_fragments: HashMap::from([
            (
                "base.assistant".to_string(),
                "You are operating in the Chat profile.\n\nDefault behaviour:\n1. Answer the user directly when you can.\n2. Use tools when they are available and genuinely helpful.\n3. Only delegate to subagents when it materially improves the result.".to_string(),
            ),
            (
                "base.coordinator".to_string(),
                "You are operating in the Coordinate profile as the leader agent.\n\nYour role is coordination only:\n1. Inspect context with listing and read-only tools when needed.\n2. Delegate all execution and production work to subagents.\n3. Synthesize subagent results into the final response.".to_string(),
            ),
            (
                "policy.no_direct_execution".to_string(),
                "Hard rules:\n- You must not execute implementation work yourself.\n- You must not use mutating or execution tools yourself.\n- You may only use list_dir, read, and spawn_subagent.".to_string(),
            ),
        ]),
        policies: ModePolicyCatalog {
            permission: vec![PermissionPolicyDefinition {
                id: "coordinator_strict".to_string(),
                mode: PermissionMode::Plan,
                allowed_tools: vec![
                    "list_dir".to_string(),
                    "read".to_string(),
                    "spawn_subagent".to_string(),
                ],
                denied_tools: vec![
                    "write".to_string(),
                    "edit".to_string(),
                    "shell".to_string(),
                    "delete".to_string(),
                    "plan".to_string(),
                    "ask_user".to_string(),
                ],
                locked: true,
            }],
            delegation: vec![DelegationPolicyDefinition {
                id: "coordinate_delegate_only".to_string(),
                enabled: true,
                root_may_execute: false,
                max_subagents_per_turn: Some(3),
            }],
            review: vec![ReviewPolicyDefinition {
                id: "coordinate_optional".to_string(),
                required: false,
                human_checkpoint_required: false,
            }],
            completion: vec![CompletionPolicyDefinition {
                id: "direct_answer".to_string(),
                strategy: "direct_answer".to_string(),
            }],
            observability: vec![ObservabilityPolicyDefinition {
                id: "standard".to_string(),
                capture_resolved_spec: true,
                capture_provenance: true,
            }],
            limits: vec![LimitPolicyDefinition {
                id: "default".to_string(),
                agent_turn_limit: None,
            }],
        },
    }
}

fn default_explorer_subagent() -> ModeDefinition {
    ModeDefinition::Subagent {
        schema_version: MODE_SCHEMA_VERSION,
        agent: SubagentDefinition {
            id: "explorer".to_string(),
            label: "Explorer".to_string(),
            description: "Read-only codebase exploration specialist for searching, tracing, and understanding code.".to_string(),
            prompt_refs: vec!["subagent.explorer".to_string()],
            model: RuntimeProfileModelConfig::default(),
            permissions: RuntimeProfilePermissions {
                locked: false,
                default_mode: Some(PermissionMode::Plan),
                allowed_tools: vec!["read".to_string(), "shell".to_string(), "skill".to_string()],
                disallowed_tools: vec!["write".to_string(), "edit".to_string(), "delete".to_string()],
            },
            max_turns: None,
        },
        prompt_fragments: HashMap::from([(
            "subagent.explorer".to_string(),
            "You are an explorer subagent.\nFocus on reading, tracing, and summarizing the codebase.\nDo not make code changes.".to_string(),
        )]),
    }
}

fn default_coder_subagent() -> ModeDefinition {
    ModeDefinition::Subagent {
        schema_version: MODE_SCHEMA_VERSION,
        agent: SubagentDefinition {
            id: "coder".to_string(),
            label: "Coder".to_string(),
            description: "Implementation-focused coding subagent for making targeted code changes.".to_string(),
            prompt_refs: vec!["subagent.coder".to_string()],
            model: RuntimeProfileModelConfig::default(),
            permissions: RuntimeProfilePermissions {
                locked: false,
                default_mode: Some(PermissionMode::FullAuto),
                allowed_tools: vec![],
                disallowed_tools: vec![],
            },
            max_turns: None,
        },
        prompt_fragments: HashMap::from([(
            "subagent.coder".to_string(),
            "You are a coder subagent.\nRead the relevant files first, then make the smallest effective code changes to complete the assigned task.".to_string(),
        )]),
    }
}

fn default_reviewer_subagent() -> ModeDefinition {
    ModeDefinition::Subagent {
        schema_version: MODE_SCHEMA_VERSION,
        agent: SubagentDefinition {
            id: "reviewer".to_string(),
            label: "Reviewer".to_string(),
            description: "Review-focused subagent for checking correctness, regressions, and risks.".to_string(),
            prompt_refs: vec!["subagent.reviewer".to_string()],
            model: RuntimeProfileModelConfig::default(),
            permissions: RuntimeProfilePermissions {
                locked: false,
                default_mode: Some(PermissionMode::Plan),
                allowed_tools: vec!["read".to_string(), "shell".to_string(), "skill".to_string()],
                disallowed_tools: vec!["write".to_string(), "edit".to_string(), "delete".to_string()],
            },
            max_turns: None,
        },
        prompt_fragments: HashMap::from([(
            "subagent.reviewer".to_string(),
            "You are a reviewer subagent.\nPrioritize bugs, regressions, edge cases, and missing validation over general summaries.".to_string(),
        )]),
    }
}

pub fn default_mode_definitions() -> Vec<ModeDefinition> {
    vec![
        default_chat_mode(),
        default_coordinate_mode(),
        default_explorer_subagent(),
        default_coder_subagent(),
        default_reviewer_subagent(),
    ]
}

pub fn ensure_mode_files() -> Result<Vec<ModeDefinition>, String> {
    let agents_dir = paths::get_agents_dir();
    paths::ensure_dir(&agents_dir).map_err(|e| e.to_string())?;

    let defaults = default_mode_definitions();
    let mut changed = false;
    let legacy_modes_dir = paths::get_legacy_modes_dir();
    let should_migrate_legacy = legacy_modes_dir.exists()
        && fs::read_dir(&agents_dir)
            .map_err(|e| e.to_string())?
            .next()
            .is_none();
    if should_migrate_legacy {
        let legacy_modes = load_mode_definitions_from_dir(&legacy_modes_dir)?;
        if !legacy_modes.is_empty() {
            save_mode_definitions(&legacy_modes)?;
            changed = true;
        }
    }
    for mode in &defaults {
        let path = paths::get_agent_definition_path(mode.id());
        if !path.exists() {
            write_mode_definition(path.as_path(), mode)?;
            changed = true;
        }
    }

    let mut loaded = load_mode_definitions()?;
    if loaded.is_empty() {
        save_mode_definitions(&defaults)?;
        loaded = defaults;
        changed = true;
    }

    if changed {
        loaded = load_mode_definitions()?;
    }

    Ok(loaded)
}

pub fn load_mode_definitions() -> Result<Vec<ModeDefinition>, String> {
    let agents_dir = paths::get_agents_dir();
    if !agents_dir.exists() {
        return Ok(Vec::new());
    }

    load_mode_definitions_from_dir(&agents_dir)
}

fn load_mode_definitions_from_dir(dir: &std::path::Path) -> Result<Vec<ModeDefinition>, String> {
    let mut modes = Vec::new();
    load_mode_definitions_from_dir_recursive(dir, &mut modes)?;

    modes.sort_by(|left, right| left.id().cmp(right.id()));
    Ok(modes)
}

fn load_mode_definitions_from_dir_recursive(
    dir: &std::path::Path,
    modes: &mut Vec<ModeDefinition>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let path = entry.path();
        if file_type.is_dir() {
            load_mode_definitions_from_dir_recursive(&path, modes)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());
        if extension.as_deref() != Some("yaml") && extension.as_deref() != Some("json") {
            continue;
        }
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mode: ModeDefinition = if extension.as_deref() == Some("json") {
            serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse mode file '{}': {}", path.display(), e))?
        } else {
            serde_yaml::from_str(&content)
                .map_err(|e| format!("Failed to parse mode file '{}': {}", path.display(), e))?
        };
        modes.push(mode);
    }

    Ok(())
}

pub fn save_mode_definitions(modes: &[ModeDefinition]) -> Result<(), String> {
    let agents_dir = paths::get_agents_dir();
    paths::ensure_dir(&agents_dir).map_err(|e| e.to_string())?;

    let expected_ids = modes
        .iter()
        .map(|mode| mode.id().to_lowercase())
        .collect::<HashSet<_>>();

    for mode in modes {
        write_mode_definition(&paths::get_agent_definition_path(mode.id()), mode)?;
    }

    for entry in fs::read_dir(&agents_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let path = entry.path();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());
        if extension.as_deref() != Some("yaml") && extension.as_deref() != Some("json") {
            continue;
        }
        let mode_id = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        if expected_ids.contains(&mode_id.to_lowercase()) {
            continue;
        }
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn write_mode_definition(path: &std::path::Path, mode: &ModeDefinition) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let yaml = serde_yaml::to_string(mode).map_err(|e| e.to_string())?;
    fs::write(path, yaml).map_err(|e| e.to_string())?;
    let legacy_json_path = path.with_extension("json");
    if legacy_json_path.exists() {
        let _ = fs::remove_file(legacy_json_path);
    }
    Ok(())
}

pub fn merge_mode_definitions_into_settings(
    settings: &mut ConfigBundle,
    modes: &[ModeDefinition],
) {
    settings.prompts.fragments.clear();
    settings.profiles.items.clear();
    settings.profiles.subagent_items.clear();

    for mode in modes {
        match mode {
            ModeDefinition::Primary { profile, .. } => settings.profiles.items.push(profile.clone()),
            ModeDefinition::Subagent { agent, .. } => settings.profiles.subagent_items.push(agent.clone()),
        }
        for (key, value) in mode.prompt_fragments() {
            settings.prompts.fragments.insert(key.clone(), value.clone());
        }
        if let Some(policies) = mode.policies() {
            merge_policy_catalog(&mut settings.policies.catalog.permission, &policies.permission);
            merge_policy_catalog(&mut settings.policies.catalog.delegation, &policies.delegation);
            merge_policy_catalog(&mut settings.policies.catalog.review, &policies.review);
            merge_policy_catalog(&mut settings.policies.catalog.completion, &policies.completion);
            merge_policy_catalog(
                &mut settings.policies.catalog.observability,
                &policies.observability,
            );
            merge_policy_catalog(&mut settings.policies.catalog.limits, &policies.limits);
        }
    }
}

fn merge_policy_catalog<T>(target: &mut Vec<T>, source: &[T])
where
    T: Clone + IdentifiedItem,
{
    for item in source {
        if let Some(existing) = target
            .iter_mut()
            .find(|existing| existing.item_id().eq_ignore_ascii_case(item.item_id()))
        {
            *existing = item.clone();
        } else {
            target.push(item.clone());
        }
    }
}

pub fn extract_mode_definitions(settings: &ConfigBundle) -> Vec<ModeDefinition> {
    let existing = load_mode_definitions().unwrap_or_else(|_| default_mode_definitions());
    let existing_map = existing
        .into_iter()
        .map(|mode| (mode.id().to_lowercase(), mode))
        .collect::<HashMap<_, _>>();

    let primary_modes = settings
        .profiles
        .items
        .iter()
        .map(|profile| {
            let mut mode = existing_map
                .get(&profile.id.to_lowercase())
                .cloned()
                .unwrap_or_else(|| ModeDefinition::Primary {
                    schema_version: MODE_SCHEMA_VERSION,
                    profile: profile.clone(),
                    prompt_fragments: HashMap::new(),
                    policies: ModePolicyCatalog::default(),
                });

            if let ModeDefinition::Primary {
                schema_version,
                profile: mode_profile,
                prompt_fragments,
                policies,
            } = &mut mode
            {
                *schema_version = MODE_SCHEMA_VERSION;
                *mode_profile = profile.clone();
                *prompt_fragments = profile
                    .prompt_refs
                    .iter()
                    .filter_map(|prompt_ref| {
                        settings
                            .prompts
                            .fragments
                            .get(prompt_ref)
                            .map(|value| (prompt_ref.clone(), value.clone()))
                    })
                    .collect();
                policies.permission = collect_permission_policies(settings, profile);
                policies.delegation = collect_named_policy(
                    &settings.policies.catalog.delegation,
                    profile.execution.delegation_policy_ref.as_deref(),
                );
                policies.review = collect_named_policy(
                    &settings.policies.catalog.review,
                    profile.execution.review_policy_ref.as_deref(),
                );
                policies.completion = collect_named_policy(
                    &settings.policies.catalog.completion,
                    profile.execution.completion_policy_ref.as_deref(),
                );
                policies.observability = collect_named_policy(
                    &settings.policies.catalog.observability,
                    profile.execution.observability_policy_ref.as_deref(),
                );
                policies.limits = collect_named_policy(
                    &settings.policies.catalog.limits,
                    profile.execution.limit_policy_ref.as_deref(),
                );
            }
            mode
        });
    let subagent_modes = settings
        .profiles
        .subagent_items
        .iter()
        .map(|subagent| {
            let mut mode = existing_map
                .get(&subagent.id.to_lowercase())
                .cloned()
                .unwrap_or_else(|| ModeDefinition::Subagent {
                    schema_version: MODE_SCHEMA_VERSION,
                    agent: subagent.clone(),
                    prompt_fragments: HashMap::new(),
                });

            if let ModeDefinition::Subagent {
                schema_version,
                agent,
                prompt_fragments,
            } = &mut mode
            {
                *schema_version = MODE_SCHEMA_VERSION;
                *agent = subagent.clone();
                *prompt_fragments = subagent
                    .prompt_refs
                    .iter()
                    .filter_map(|prompt_ref| {
                        settings
                            .prompts
                            .fragments
                            .get(prompt_ref)
                            .map(|value| (prompt_ref.clone(), value.clone()))
                    })
                    .collect();
            }

            mode
        });

    primary_modes.chain(subagent_modes).collect()
}

pub fn strip_mode_data_from_settings(settings: &mut ConfigBundle, modes: &[ModeDefinition]) {
    let prompt_keys = modes
        .iter()
        .flat_map(|mode| mode.prompt_fragments().keys().cloned())
        .collect::<HashSet<_>>();
    settings
        .prompts
        .fragments
        .retain(|key, _| !prompt_keys.contains(key));
    settings.profiles.items.clear();
    settings.profiles.subagent_items.clear();

    strip_policy_catalog(&mut settings.policies.catalog.permission, modes, |mode| {
        mode.policies()
            .map(|policies| policies.permission.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
    strip_policy_catalog(&mut settings.policies.catalog.delegation, modes, |mode| {
        mode.policies()
            .map(|policies| policies.delegation.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
    strip_policy_catalog(&mut settings.policies.catalog.review, modes, |mode| {
        mode.policies()
            .map(|policies| policies.review.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
    strip_policy_catalog(&mut settings.policies.catalog.completion, modes, |mode| {
        mode.policies()
            .map(|policies| policies.completion.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
    strip_policy_catalog(&mut settings.policies.catalog.observability, modes, |mode| {
        mode.policies()
            .map(|policies| {
                policies
                    .observability
                    .iter()
                    .map(|item| item.id.clone())
                    .collect()
            })
            .unwrap_or_default()
    });
    strip_policy_catalog(&mut settings.policies.catalog.limits, modes, |mode| {
        mode.policies()
            .map(|policies| policies.limits.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
}

fn strip_policy_catalog<T, F>(target: &mut Vec<T>, modes: &[ModeDefinition], ids_for_mode: F)
where
    T: IdentifiedItem,
    F: Fn(&ModeDefinition) -> Vec<String>,
{
    let ids = modes
        .iter()
        .flat_map(ids_for_mode)
        .map(|id| id.to_lowercase())
        .collect::<HashSet<_>>();
    target.retain(|item| !ids.contains(&item.item_id().to_lowercase()));
}

fn collect_permission_policies(
    settings: &ConfigBundle,
    profile: &RuntimeProfile,
) -> Vec<PermissionPolicyDefinition> {
    settings
        .policies
        .catalog
        .permission
        .iter()
        .filter(|policy| {
            policy.locked == profile.permissions.locked
                && profile.permissions.default_mode.as_ref() == Some(&policy.mode)
                && profile.permissions.allowed_tools == policy.allowed_tools
                && profile.permissions.disallowed_tools == policy.denied_tools
        })
        .cloned()
        .collect()
}

fn collect_named_policy<T>(catalog: &[T], id: Option<&str>) -> Vec<T>
where
    T: Clone + IdentifiedItem,
{
    id.map(|requested| {
        catalog
            .iter()
            .filter(|item| item.item_id().eq_ignore_ascii_case(requested))
            .cloned()
            .collect()
    })
    .unwrap_or_default()
}

pub fn explain_mode_snapshot(runtime_spec: &ResolvedRuntimeSpec) -> String {
    format!(
        "{}:{}",
        runtime_spec.profile.id,
        runtime_spec.completion.strategy
    )
}

trait IdentifiedItem {
    fn item_id(&self) -> &str;
}

impl IdentifiedItem for PermissionPolicyDefinition {
    fn item_id(&self) -> &str {
        &self.id
    }
}

impl IdentifiedItem for DelegationPolicyDefinition {
    fn item_id(&self) -> &str {
        &self.id
    }
}

impl IdentifiedItem for ReviewPolicyDefinition {
    fn item_id(&self) -> &str {
        &self.id
    }
}

impl IdentifiedItem for CompletionPolicyDefinition {
    fn item_id(&self) -> &str {
        &self.id
    }
}

impl IdentifiedItem for ObservabilityPolicyDefinition {
    fn item_id(&self) -> &str {
        &self.id
    }
}

impl IdentifiedItem for LimitPolicyDefinition {
    fn item_id(&self) -> &str {
        &self.id
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn load_mode_definitions_from_dir_reads_nested_yaml_files() {
        let root = std::env::temp_dir().join(format!(
            "rhythm-mode-nested-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let nested = root.join("orchestrator");
        fs::create_dir_all(&nested).unwrap();

        let yaml = r#"
kind: subagent
schema_version: 2
agent:
  id: nested-agent
  label: Nested Agent
  description: Loaded from a nested folder.
  promptRefs:
    - nested.prompt
  model:
    providerId: null
    modelId: null
    reasoning: null
  permissions:
    locked: true
    defaultMode: full_auto
    allowedTools:
      - read
    disallowedTools:
      - write
  maxTurns: 1
prompt_fragments:
  nested.prompt: |-
    Nested prompt.
"#;
        fs::write(nested.join("nested-agent.yaml"), yaml).unwrap();

        let loaded = load_mode_definitions_from_dir(&PathBuf::from(&root)).unwrap();
        let ids = loaded.into_iter().map(|mode| mode.id().to_string()).collect::<Vec<_>>();
        assert_eq!(ids, vec!["nested-agent"]);

        let _ = fs::remove_dir_all(root);
    }
}
