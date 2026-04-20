use std::collections::{HashMap, HashSet};
use std::fs;

use crate::infra::paths;
use crate::runtime::extensions::LoadedPlugin;

use super::{default_agent_schema_version, AgentDefinition, AgentKind, AgentPolicyCatalog};
use crate::infra::config::AgentDefinitionConfig;
use serde::Deserialize;

const BUNDLED_AGENT_FILES: [(&str, &str); 4] = [
    ("chat", include_str!("catalog/bundled/chat.yaml")),
    ("assistant", include_str!("catalog/bundled/assistant.yaml")),
    ("explorer", include_str!("catalog/bundled/explorer.yaml")),
    ("dynamic", include_str!("catalog/bundled/dynamic.yaml")),
];

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub(super) enum AgentKindField {
    Single(AgentKind),
    Multiple(Vec<AgentKind>),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) struct RawAgentDefinition {
    #[serde(default = "default_agent_schema_version")]
    pub(super) schema_version: u32,
    pub(super) kind: AgentKindField,
    pub(super) agent: AgentDefinitionConfig,
    #[serde(default)]
    pub(super) prompt_fragments: HashMap<String, String>,
    #[serde(default)]
    pub(super) policies: AgentPolicyCatalog,
}

pub(super) fn deserialize_agent_definition(
    raw: RawAgentDefinition,
) -> Result<AgentDefinition, String> {
    let kinds = match raw.kind {
        AgentKindField::Single(kind) => vec![kind],
        AgentKindField::Multiple(kinds) => kinds,
    };

    if kinds.is_empty() {
        return Err("agent definition kind must include at least one entry".to_string());
    }

    Ok(AgentDefinition {
        schema_version: raw.schema_version,
        kinds,
        agent: raw.agent,
        prompt_fragments: raw.prompt_fragments,
        policies: raw.policies,
    })
}

pub fn default_agent_definitions() -> Vec<AgentDefinition> {
    let mut definitions: Vec<AgentDefinition> = BUNDLED_AGENT_FILES
        .iter()
        .map(|(id, content)| {
            serde_yaml::from_str::<RawAgentDefinition>(content)
                .map_err(|e| e.to_string())
                .and_then(deserialize_agent_definition)
                .unwrap_or_else(|error| panic!("failed to parse bundled agent '{id}': {error}"))
        })
        .collect::<Vec<_>>();
    definitions.sort_by(|left, right| left.id().cmp(right.id()));
    definitions
}

pub fn load_all_agent_definitions(
    plugins: Option<&[LoadedPlugin]>,
) -> Result<Vec<AgentDefinition>, String> {
    let bundled = default_agent_definitions();
    let from_plugins = plugins
        .map(|p| p.iter().flat_map(|plugin| plugin.agents.clone()).collect())
        .unwrap_or_default();
    let custom = load_custom_agent_definitions()?;
    Ok(merge_agent_definitions(bundled, from_plugins, custom))
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
    from_plugins: Vec<AgentDefinition>,
    custom: Vec<AgentDefinition>,
) -> Vec<AgentDefinition> {
    let mut seen: HashSet<String> = bundled
        .iter()
        .map(|definition| definition.id().to_lowercase())
        .collect();
    let mut merged: Vec<AgentDefinition> = bundled;

    for definition in from_plugins {
        let id = definition.id().to_lowercase();
        if let Some(existing) = merged.iter_mut().find(|d| d.id().eq_ignore_ascii_case(&id)) {
            *existing = definition;
        } else {
            seen.insert(id.clone());
            merged.push(definition);
        }
    }

    for definition in custom {
        let id = definition.id().to_lowercase();
        if seen.contains(&id) {
            eprintln!(
                "[agents] Ignoring custom agent definition '{}' because it conflicts with a bundled or plugin agent id",
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

pub(super) fn load_agent_definitions_from_dir(
    dir: &std::path::Path,
) -> Result<Vec<AgentDefinition>, String> {
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
            let raw: RawAgentDefinition = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse agent file '{}': {}", path.display(), e))?;
            deserialize_agent_definition(raw)?
        } else {
            let raw: RawAgentDefinition = serde_yaml::from_str(&content)
                .map_err(|e| format!("Failed to parse agent file '{}': {}", path.display(), e))?;
            deserialize_agent_definition(raw)?
        };
        definitions.push(definition);
    }

    Ok(())
}
