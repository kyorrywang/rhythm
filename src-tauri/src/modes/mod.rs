use crate::infrastructure::config::{
    CompletionPolicyDefinition, ConfigBundle, DelegationPolicyDefinition,
    LimitPolicyDefinition, ObservabilityPolicyDefinition,
    PermissionPolicyDefinition, ResolvedRuntimeSpec, ReviewPolicyDefinition, RuntimeProfile,
    RuntimeProfileExecution, RuntimeProfileModelConfig, RuntimeProfilePermissions,
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
pub struct ModeDefinition {
    #[serde(default = "default_mode_schema_version")]
    pub schema_version: u32,
    pub profile: RuntimeProfile,
    #[serde(default)]
    pub prompt_fragments: HashMap<String, String>,
    #[serde(default)]
    pub policies: ModePolicyCatalog,
}

fn default_mode_schema_version() -> u32 {
    MODE_SCHEMA_VERSION
}

fn default_chat_mode() -> ModeDefinition {
    ModeDefinition {
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
    ModeDefinition {
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
                completion_policy_ref: Some("delegate_then_summarize".to_string()),
                observability_policy_ref: Some("standard".to_string()),
                limit_policy_ref: Some("default".to_string()),
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
                "Hard rules:\n- You must not execute implementation work yourself.\n- You must not use mutating or execution tools yourself.\n- You may only use list_dir, read, and spawn_subagent.\n- You cannot complete the task without delegating at least once.".to_string(),
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
                id: "delegate_then_summarize".to_string(),
                strategy: "delegate_then_summarize".to_string(),
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

pub fn default_mode_definitions() -> Vec<ModeDefinition> {
    vec![default_chat_mode(), default_coordinate_mode()]
}

pub fn ensure_mode_files() -> Result<Vec<ModeDefinition>, String> {
    let modes_dir = paths::get_modes_dir();
    paths::ensure_dir(&modes_dir).map_err(|e| e.to_string())?;

    let defaults = default_mode_definitions();
    let mut changed = false;
    for mode in &defaults {
        let path = paths::get_mode_definition_path(&mode.profile.id);
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
    let modes_dir = paths::get_modes_dir();
    if !modes_dir.exists() {
        return Ok(Vec::new());
    }

    let mut modes = Vec::new();
    for entry in fs::read_dir(&modes_dir).map_err(|e| e.to_string())? {
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

    modes.sort_by(|left, right| left.profile.id.cmp(&right.profile.id));
    Ok(modes)
}

pub fn save_mode_definitions(modes: &[ModeDefinition]) -> Result<(), String> {
    let modes_dir = paths::get_modes_dir();
    paths::ensure_dir(&modes_dir).map_err(|e| e.to_string())?;

    let expected_ids = modes
        .iter()
        .map(|mode| mode.profile.id.to_lowercase())
        .collect::<HashSet<_>>();

    for mode in modes {
        write_mode_definition(&paths::get_mode_definition_path(&mode.profile.id), mode)?;
    }

    for entry in fs::read_dir(&modes_dir).map_err(|e| e.to_string())? {
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

    for mode in modes {
        settings.profiles.items.push(mode.profile.clone());
        for (key, value) in &mode.prompt_fragments {
            settings.prompts.fragments.insert(key.clone(), value.clone());
        }
        merge_policy_catalog(&mut settings.policies.catalog.permission, &mode.policies.permission);
        merge_policy_catalog(&mut settings.policies.catalog.delegation, &mode.policies.delegation);
        merge_policy_catalog(&mut settings.policies.catalog.review, &mode.policies.review);
        merge_policy_catalog(&mut settings.policies.catalog.completion, &mode.policies.completion);
        merge_policy_catalog(
            &mut settings.policies.catalog.observability,
            &mode.policies.observability,
        );
        merge_policy_catalog(&mut settings.policies.catalog.limits, &mode.policies.limits);
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
        .map(|mode| (mode.profile.id.to_lowercase(), mode))
        .collect::<HashMap<_, _>>();

    settings
        .profiles
        .items
        .iter()
        .map(|profile| {
            let mut mode = existing_map
                .get(&profile.id.to_lowercase())
                .cloned()
                .unwrap_or_else(|| ModeDefinition {
                    schema_version: MODE_SCHEMA_VERSION,
                    profile: profile.clone(),
                    prompt_fragments: HashMap::new(),
                    policies: ModePolicyCatalog::default(),
                });

            mode.schema_version = MODE_SCHEMA_VERSION;
            mode.profile = profile.clone();
            mode.prompt_fragments = profile
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
            mode.policies.permission = collect_permission_policies(settings, profile);
            mode.policies.delegation = collect_named_policy(
                &settings.policies.catalog.delegation,
                profile.execution.delegation_policy_ref.as_deref(),
            );
            mode.policies.review = collect_named_policy(
                &settings.policies.catalog.review,
                profile.execution.review_policy_ref.as_deref(),
            );
            mode.policies.completion = collect_named_policy(
                &settings.policies.catalog.completion,
                profile.execution.completion_policy_ref.as_deref(),
            );
            mode.policies.observability = collect_named_policy(
                &settings.policies.catalog.observability,
                profile.execution.observability_policy_ref.as_deref(),
            );
            mode.policies.limits = collect_named_policy(
                &settings.policies.catalog.limits,
                profile.execution.limit_policy_ref.as_deref(),
            );
            mode
        })
        .collect()
}

pub fn strip_mode_data_from_settings(settings: &mut ConfigBundle, modes: &[ModeDefinition]) {
    let prompt_keys = modes
        .iter()
        .flat_map(|mode| mode.prompt_fragments.keys().cloned())
        .collect::<HashSet<_>>();
    settings
        .prompts
        .fragments
        .retain(|key, _| !prompt_keys.contains(key));
    settings.profiles.items.clear();

    strip_policy_catalog(&mut settings.policies.catalog.permission, modes, |mode| {
        mode.policies.permission.iter().map(|item| item.id.clone()).collect()
    });
    strip_policy_catalog(&mut settings.policies.catalog.delegation, modes, |mode| {
        mode.policies.delegation.iter().map(|item| item.id.clone()).collect()
    });
    strip_policy_catalog(&mut settings.policies.catalog.review, modes, |mode| {
        mode.policies.review.iter().map(|item| item.id.clone()).collect()
    });
    strip_policy_catalog(&mut settings.policies.catalog.completion, modes, |mode| {
        mode.policies.completion.iter().map(|item| item.id.clone()).collect()
    });
    strip_policy_catalog(&mut settings.policies.catalog.observability, modes, |mode| {
        mode.policies
            .observability
            .iter()
            .map(|item| item.id.clone())
            .collect()
    });
    strip_policy_catalog(&mut settings.policies.catalog.limits, modes, |mode| {
        mode.policies.limits.iter().map(|item| item.id.clone()).collect()
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
