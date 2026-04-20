use crate::infra::config;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FrontendProviderModel {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub note: Option<String>,
    #[serde(default)]
    pub capabilities: config::ModelCapabilities,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FrontendProviderConfig {
    pub id: String,
    pub name: String,
    #[serde(default = "default_provider_format")]
    pub provider: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(default)]
    pub capabilities: config::ProviderCapabilities,
    pub models: Vec<FrontendProviderModel>,
}

fn default_provider_format() -> String {
    String::new()
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FrontendHookConfig {
    pub id: String,
    pub stage: String,
    #[serde(rename = "type")]
    pub hook_type: String,
    pub matcher: String,
    pub timeout: u64,
    #[serde(rename = "blockOnFailure")]
    pub block_on_failure: bool,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FrontendMcpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub endpoint: String,
    pub enabled: bool,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FrontendSettings {
    pub theme: String,
    #[serde(rename = "themePreset")]
    pub theme_preset: String,
    #[serde(rename = "autoSaveSessions")]
    pub auto_save_sessions: bool,
    pub providers: Vec<FrontendProviderConfig>,
    #[serde(rename = "systemPrompt")]
    pub system_prompt: String,
    #[serde(rename = "permissionMode")]
    pub permission_mode: String,
    #[serde(rename = "allowedTools")]
    pub allowed_tools: Vec<String>,
    #[serde(rename = "deniedTools")]
    pub denied_tools: Vec<String>,
    #[serde(rename = "pathRules")]
    pub path_rules: Vec<String>,
    #[serde(rename = "deniedCommands")]
    pub denied_commands: Vec<String>,
    #[serde(rename = "memoryEnabled")]
    pub memory_enabled: bool,
    #[serde(rename = "memoryMaxFiles")]
    pub memory_max_files: usize,
    #[serde(rename = "memoryMaxEntrypointLines")]
    pub memory_max_entrypoint_lines: usize,
    pub hooks: Vec<FrontendHookConfig>,
    #[serde(rename = "mcpServers")]
    pub mcp_servers: Vec<FrontendMcpServerConfig>,
    #[serde(rename = "enabledPlugins")]
    pub enabled_plugins: Vec<String>,
    #[serde(rename = "defaultAgentId")]
    pub default_agent_id: String,
    #[serde(rename = "defaultReasoning")]
    pub default_reasoning: String,
    pub agents: Vec<config::AgentDefinitionConfig>,
}
