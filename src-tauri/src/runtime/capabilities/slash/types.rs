use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashProviderRef {
    #[serde(rename = "type")]
    pub provider_type: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashEntryRef {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashHandlerRef {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommandDescriptor {
    pub name: String,
    pub title: String,
    pub description: String,
    pub kind: String,
    pub provider: SlashProviderRef,
    pub entry: SlashEntryRef,
    pub handler: SlashHandlerRef,
    pub context_policy: String,
    pub default_skill: Option<String>,
    pub source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SlashCommandRegistryResponse {
    pub commands: Vec<SlashCommandDescriptor>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashRuntimeInput {
    pub user_input: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashRuntimeExecutionContext {
    pub cwd: String,
    pub session_id: String,
    pub agent_id: String,
    pub definition_id: String,
    pub provider_id: String,
    pub model: String,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSlashContributionRuntimeConfig {
    pub commands_dir: String,
    pub skills_dir: String,
    pub runtime_entry: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSlashRuntimeRequest {
    pub descriptor: SlashCommandDescriptor,
    pub slash: PluginSlashContributionRuntimeConfig,
    pub input: SlashRuntimeInput,
    pub context: SlashRuntimeExecutionContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredAskQuestion {
    pub id: String,
    pub question: String,
    pub options: Vec<String>,
    #[serde(rename = "selectionType")]
    pub selection_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredAskAnswer {
    pub question_id: String,
    pub selected: Vec<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredAskResponse {
    pub answers: Vec<StructuredAskAnswer>,
}
