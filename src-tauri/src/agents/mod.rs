pub mod spec;

use crate::infrastructure::config::{
    CompletionPolicyDefinition, ConfigBundle, DelegationPolicyDefinition,
    LimitPolicyDefinition, ObservabilityPolicyDefinition, PermissionPolicyDefinition,
    ResolvedRuntimeSpec, ReviewPolicyDefinition, RuntimeProfile, SubagentDefinition,
};
use crate::infrastructure::paths;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;

const AGENT_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AgentPolicyCatalog {
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
pub enum AgentDefinition {
    Primary {
        #[serde(default = "default_agent_schema_version")]
        schema_version: u32,
        profile: RuntimeProfile,
        #[serde(default)]
        prompt_fragments: HashMap<String, String>,
        #[serde(default)]
        policies: AgentPolicyCatalog,
    },
    Subagent {
        #[serde(default = "default_agent_schema_version")]
        schema_version: u32,
        agent: SubagentDefinition,
        #[serde(default)]
        prompt_fragments: HashMap<String, String>,
    },
}

impl AgentDefinition {
    pub fn id(&self) -> &str {
        match self {
            Self::Primary { profile, .. } => &profile.id,
            Self::Subagent { agent, .. } => &agent.id,
        }
    }

    pub fn profile(&self) -> Option<&RuntimeProfile> {
        match self {
            Self::Primary { profile, .. } => Some(profile),
            Self::Subagent { .. } => None,
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

    pub fn policies(&self) -> Option<&AgentPolicyCatalog> {
        match self {
            Self::Primary { policies, .. } => Some(policies),
            Self::Subagent { .. } => None,
        }
    }
}

fn default_agent_schema_version() -> u32 {
    AGENT_SCHEMA_VERSION
}

const BUNDLED_AGENT_FILES: [(&str, &str); 6] = [
    ("chat", include_str!("bundled/chat.yaml")),
    ("coordinate", include_str!("bundled/coordinate.yaml")),
    ("explorer", include_str!("bundled/explorer.yaml")),
    ("dynamic", include_str!("bundled/dynamic.yaml")),
    ("spec", include_str!("bundled/spec.yaml")),
    ("spec-agent", include_str!("bundled/spec-agent.yaml")),
];

pub fn default_agent_definitions() -> Vec<AgentDefinition> {
    let mut definitions = BUNDLED_AGENT_FILES
        .iter()
        .map(|(id, content)| {
            serde_yaml::from_str::<AgentDefinition>(content)
                .unwrap_or_else(|error| panic!("failed to parse bundled agent '{id}': {error}"))
        })
        .collect::<Vec<_>>();
    definitions.sort_by(|left, right| left.id().cmp(right.id()));
    definitions
}

pub fn load_all_agent_definitions() -> Result<Vec<AgentDefinition>, String> {
    let bundled = default_agent_definitions();
    let custom = load_custom_agent_definitions()?;
    Ok(merge_agent_definitions(bundled, custom))
}

pub fn load_custom_agent_definitions() -> Result<Vec<AgentDefinition>, String> {
    let agents_dir = paths::get_agents_dir();
    if !agents_dir.exists() {
        return Ok(Vec::new());
    }
    load_agent_definitions_from_dir(&agents_dir)
}

fn merge_agent_definitions(
    bundled: Vec<AgentDefinition>,
    custom: Vec<AgentDefinition>,
) -> Vec<AgentDefinition> {
    let mut seen = bundled
        .iter()
        .map(|definition| definition.id().to_lowercase())
        .collect::<HashSet<_>>();
    let mut merged = bundled;

    for definition in custom {
        let id = definition.id().to_lowercase();
        if seen.contains(&id) {
            eprintln!(
                "[agents] Ignoring custom agent definition '{}' because it conflicts with a bundled agent id",
                definition.id()
            );
            continue;
        }
        seen.insert(id);
        merged.push(definition);
    }

    merged.sort_by(|left, right| left.id().cmp(right.id()));
    merged
}

fn load_agent_definitions_from_dir(dir: &std::path::Path) -> Result<Vec<AgentDefinition>, String> {
    let mut definitions = Vec::new();
    load_agent_definitions_from_dir_recursive(dir, &mut definitions)?;
    definitions.sort_by(|left, right| left.id().cmp(right.id()));
    Ok(definitions)
}

fn load_agent_definitions_from_dir_recursive(
    dir: &std::path::Path,
    definitions: &mut Vec<AgentDefinition>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let path = entry.path();
        if file_type.is_dir() {
            load_agent_definitions_from_dir_recursive(&path, definitions)?;
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
        let definition = if extension.as_deref() == Some("json") {
            serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse agent file '{}': {}", path.display(), e))?
        } else {
            serde_yaml::from_str(&content)
                .map_err(|e| format!("Failed to parse agent file '{}': {}", path.display(), e))?
        };
        definitions.push(definition);
    }

    Ok(())
}

pub fn merge_agent_definitions_into_settings(
    settings: &mut ConfigBundle,
    definitions: &[AgentDefinition],
) {
    settings.prompts.fragments.clear();
    settings.profiles.items.clear();
    settings.profiles.subagent_items.clear();

    for definition in definitions {
        match definition {
            AgentDefinition::Primary { profile, .. } => settings.profiles.items.push(profile.clone()),
            AgentDefinition::Subagent { agent, .. } => {
                settings.profiles.subagent_items.push(agent.clone())
            }
        }

        for (key, value) in definition.prompt_fragments() {
            settings.prompts.fragments.insert(key.clone(), value.clone());
        }

        if let Some(policies) = definition.policies() {
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

pub fn strip_agent_data_from_settings(
    settings: &mut ConfigBundle,
    definitions: &[AgentDefinition],
) {
    let prompt_keys = definitions
        .iter()
        .flat_map(|definition| definition.prompt_fragments().keys().cloned())
        .collect::<HashSet<_>>();
    settings
        .prompts
        .fragments
        .retain(|key, _| !prompt_keys.contains(key));
    settings.profiles.items.clear();
    settings.profiles.subagent_items.clear();

    strip_policy_catalog(&mut settings.policies.catalog.permission, definitions, |definition| {
        definition
            .policies()
            .map(|policies| policies.permission.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
    strip_policy_catalog(&mut settings.policies.catalog.delegation, definitions, |definition| {
        definition
            .policies()
            .map(|policies| policies.delegation.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
    strip_policy_catalog(&mut settings.policies.catalog.review, definitions, |definition| {
        definition
            .policies()
            .map(|policies| policies.review.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
    strip_policy_catalog(&mut settings.policies.catalog.completion, definitions, |definition| {
        definition
            .policies()
            .map(|policies| policies.completion.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
    strip_policy_catalog(
        &mut settings.policies.catalog.observability,
        definitions,
        |definition| {
            definition
                .policies()
                .map(|policies| {
                    policies
                        .observability
                        .iter()
                        .map(|item| item.id.clone())
                        .collect()
                })
                .unwrap_or_default()
        },
    );
    strip_policy_catalog(&mut settings.policies.catalog.limits, definitions, |definition| {
        definition
            .policies()
            .map(|policies| policies.limits.iter().map(|item| item.id.clone()).collect())
            .unwrap_or_default()
    });
}

pub fn explain_agent_snapshot(runtime_spec: &ResolvedRuntimeSpec) -> String {
    format!(
        "{}:{}",
        runtime_spec.profile.id,
        runtime_spec.completion.strategy
    )
}

pub fn get_agent_id() -> Option<String> {
    std::env::var("RHYTHM_AGENT_ID")
        .ok()
        .filter(|value| !value.is_empty())
}

pub fn get_team_name() -> Option<String> {
    std::env::var("RHYTHM_TEAM_NAME")
        .ok()
        .filter(|value| !value.is_empty())
}

pub fn is_swarm_worker() -> bool {
    get_agent_id().is_some() && get_team_name().is_some()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TaskNotification {
    pub task_id: String,
    pub status: TaskNotificationStatus,
    pub summary: String,
    pub result: String,
    pub total_tokens: u64,
    pub tool_uses: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskNotificationStatus {
    Completed,
    Failed,
    Killed,
}

pub fn format_task_notification(notification: &TaskNotification) -> String {
    let status = match notification.status {
        TaskNotificationStatus::Completed => "completed",
        TaskNotificationStatus::Failed => "failed",
        TaskNotificationStatus::Killed => "killed",
    };
    format!(
        "<task-notification>\n  \
         <task-id>{}</task-id>\n  \
         <status>{}</status>\n  \
         <summary>{}</summary>\n  \
         <result>{}</result>\n  \
         <usage>\n    \
           <total_tokens>{}</total_tokens>\n    \
           <tool_uses>{}</tool_uses>\n    \
           <duration_ms>{}</duration_ms>\n  \
         </usage>\n\
         </task-notification>",
        notification.task_id,
        status,
        notification.summary,
        notification.result,
        notification.total_tokens,
        notification.tool_uses,
        notification.duration_ms,
    )
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

fn strip_policy_catalog<T, F>(
    target: &mut Vec<T>,
    definitions: &[AgentDefinition],
    ids_for_definition: F,
) where
    T: IdentifiedItem,
    F: Fn(&AgentDefinition) -> Vec<String>,
{
    let ids = definitions
        .iter()
        .flat_map(ids_for_definition)
        .map(|id| id.to_lowercase())
        .collect::<HashSet<_>>();
    target.retain(|item| !ids.contains(&item.item_id().to_lowercase()));
}

pub fn collect_permission_policies(
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

pub fn collect_named_policy<T>(catalog: &[T], id: Option<&str>) -> Vec<T>
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

pub trait IdentifiedItem {
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
    fn default_agent_definitions_include_expected_bundled_ids() {
        let ids = default_agent_definitions()
            .into_iter()
            .map(|definition| definition.id().to_string())
            .collect::<HashSet<_>>();

        for id in ["chat", "coordinate", "explorer", "dynamic", "spec", "spec-agent"] {
            assert!(ids.contains(id), "missing bundled agent {id}");
        }
    }

    #[test]
    fn load_agent_definitions_from_dir_reads_nested_yaml_files() {
        let root = std::env::temp_dir().join(format!(
            "rhythm-agent-nested-{}",
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
  maxTurns: 4
prompt_fragments:
  nested.prompt: Nested prompt body.
"#;
        fs::write(nested.join("nested-agent.yaml"), yaml).unwrap();

        let loaded = load_agent_definitions_from_dir(&PathBuf::from(&root)).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id(), "nested-agent");

        let _ = fs::remove_dir_all(root);
    }
}
