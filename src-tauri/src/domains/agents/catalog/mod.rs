use crate::platform::config::{
    AgentConfigKind, AgentDefinitionConfig, CompletionPolicyDefinition, ConfigBundle,
    DelegationPolicyDefinition, LimitPolicyDefinition, ObservabilityPolicyDefinition,
    PermissionPolicyDefinition, ResolvedAgentSpec, ReviewPolicyDefinition,
};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::{HashMap, HashSet};

#[path = "../catalog_loader.rs"]
mod loader;

pub use loader::{default_agent_definitions, load_all_agent_definitions, load_custom_agent_definitions};

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

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentKind {
    Primary,
    Subagent,
}

#[derive(Debug, Serialize, Clone)]
pub struct AgentDefinition {
    pub schema_version: u32,
    pub kinds: Vec<AgentKind>,
    pub agent: AgentDefinitionConfig,
    pub prompt_fragments: HashMap<String, String>,
    pub policies: AgentPolicyCatalog,
}

impl<'de> Deserialize<'de> for AgentDefinition {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = loader::RawAgentDefinition::deserialize(deserializer)?;
        let kinds = match raw.kind {
            loader::AgentKindField::Single(kind) => vec![kind],
            loader::AgentKindField::Multiple(kinds) => kinds,
        };

        if kinds.is_empty() {
            return Err(serde::de::Error::custom(
                "agent definition kind must include at least one entry",
            ));
        }

        Ok(Self {
            schema_version: raw.schema_version,
            kinds,
            agent: raw.agent,
            prompt_fragments: raw.prompt_fragments,
            policies: raw.policies,
        })
    }
}

impl AgentDefinition {
    pub fn id(&self) -> &str {
        &self.agent.id
    }

    pub fn primary_agent(&self) -> Option<&AgentDefinitionConfig> {
        self.kinds
            .contains(&AgentKind::Primary)
            .then_some(&self.agent)
    }

    pub fn delegated_agent(&self) -> Option<&AgentDefinitionConfig> {
        self.kinds
            .contains(&AgentKind::Subagent)
            .then_some(&self.agent)
    }

    pub fn prompt_fragments(&self) -> &HashMap<String, String> {
        &self.prompt_fragments
    }

    pub fn policies(&self) -> Option<&AgentPolicyCatalog> {
        self.kinds
            .contains(&AgentKind::Primary)
            .then_some(&self.policies)
    }
}

pub(super) fn default_agent_schema_version() -> u32 {
    AGENT_SCHEMA_VERSION
}

pub fn merge_agent_definitions_into_settings(
    settings: &mut ConfigBundle,
    definitions: &[AgentDefinition],
) {
    settings.prompts.fragments.clear();
    settings.agents.items.clear();

    for definition in definitions {
        let mut agent = definition.agent.clone();
        agent.kinds = definition
            .kinds
            .iter()
            .map(|kind| match kind {
                AgentKind::Primary => AgentConfigKind::Primary,
                AgentKind::Subagent => AgentConfigKind::Subagent,
            })
            .collect();
        settings.agents.items.push(agent);

        for (key, value) in definition.prompt_fragments() {
            settings
                .prompts
                .fragments
                .insert(key.clone(), value.clone());
        }

        if let Some(policies) = definition.policies() {
            merge_policy_catalog(
                &mut settings.policies.catalog.permission,
                &policies.permission,
            );
            merge_policy_catalog(
                &mut settings.policies.catalog.delegation,
                &policies.delegation,
            );
            merge_policy_catalog(&mut settings.policies.catalog.review, &policies.review);
            merge_policy_catalog(
                &mut settings.policies.catalog.completion,
                &policies.completion,
            );
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
    settings.agents.items.clear();

    strip_policy_catalog(
        &mut settings.policies.catalog.permission,
        definitions,
        |definition| {
            definition
                .policies()
                .map(|policies| {
                    policies
                        .permission
                        .iter()
                        .map(|item| item.id.clone())
                        .collect()
                })
                .unwrap_or_default()
        },
    );
    strip_policy_catalog(
        &mut settings.policies.catalog.delegation,
        definitions,
        |definition| {
            definition
                .policies()
                .map(|policies| {
                    policies
                        .delegation
                        .iter()
                        .map(|item| item.id.clone())
                        .collect()
                })
                .unwrap_or_default()
        },
    );
    strip_policy_catalog(
        &mut settings.policies.catalog.review,
        definitions,
        |definition| {
            definition
                .policies()
                .map(|policies| policies.review.iter().map(|item| item.id.clone()).collect())
                .unwrap_or_default()
        },
    );
    strip_policy_catalog(
        &mut settings.policies.catalog.completion,
        definitions,
        |definition| {
            definition
                .policies()
                .map(|policies| {
                    policies
                        .completion
                        .iter()
                        .map(|item| item.id.clone())
                        .collect()
                })
                .unwrap_or_default()
        },
    );
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
    strip_policy_catalog(
        &mut settings.policies.catalog.limits,
        definitions,
        |definition| {
            definition
                .policies()
                .map(|policies| policies.limits.iter().map(|item| item.id.clone()).collect())
                .unwrap_or_default()
        },
    );
}

pub fn explain_agent_snapshot(runtime_spec: &ResolvedAgentSpec) -> String {
    format!(
        "{}:{}",
        runtime_spec.agent.id, runtime_spec.completion.strategy
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
    agent: &AgentDefinitionConfig,
) -> Vec<PermissionPolicyDefinition> {
    settings
        .policies
        .catalog
        .permission
        .iter()
        .filter(|policy| {
            policy.locked == agent.permissions.locked
                && agent.permissions.default_mode.as_ref() == Some(&policy.mode)
                && agent.permissions.allowed_tools == policy.allowed_tools
                && agent.permissions.disallowed_tools == policy.denied_tools
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

        for id in ["chat", "explorer", "dynamic"] {
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

    #[test]
    fn load_agent_definitions_supports_dual_identity_kind_arrays() {
        let yaml = r#"
kind:
  - primary
  - subagent
schema_version: 2
agent:
  id: dual-agent
  label: Dual Agent
  mode: Chat
  description: Dual identity agent.
  promptRefs:
    - dual.prompt
  model:
    providerId: null
    modelId: null
    reasoning: high
  permissions:
    locked: true
    defaultMode: plan
    allowedTools:
      - read
    disallowedTools:
      - write
  execution:
    availableDelegateAgentIds:
      - dynamic
  maxTurns: 6
prompt_fragments:
  dual.prompt: Dual prompt body.
policies:
  completion:
    - id: dual-completion
      strategy: direct_answer
"#;

        let definition: AgentDefinition =
            serde_yaml::from_str(yaml).expect("dual identity agent should parse");

        assert_eq!(definition.id(), "dual-agent");
        assert!(definition.primary_agent().is_some());
        assert!(definition.delegated_agent().is_some());
        assert!(definition.policies().is_some());
    }
}
