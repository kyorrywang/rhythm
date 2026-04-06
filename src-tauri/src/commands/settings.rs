use std::collections::HashMap;

use crate::infrastructure::config::{self, CommandHookConfig, HookConfig, HooksConfig, HttpHookConfig, RhythmSettings};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FrontendProviderModel {
    pub id: String,
    pub name: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    pub enabled: bool,
    pub note: Option<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FrontendProviderConfig {
    pub id: String,
    pub name: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    pub models: Vec<FrontendProviderModel>,
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
    #[serde(rename = "autoSaveSessions")]
    pub auto_save_sessions: bool,
    pub providers: Vec<FrontendProviderConfig>,
    #[serde(rename = "maxTurns")]
    pub max_turns: usize,
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
    #[serde(rename = "autoCompactEnabled")]
    pub auto_compact_enabled: bool,
    #[serde(rename = "autoCompactThresholdRatio")]
    pub auto_compact_threshold_ratio: f32,
    #[serde(rename = "autoCompactMaxMicroCompacts")]
    pub auto_compact_max_micro_compacts: usize,
    #[serde(rename = "enabledPlugins")]
    pub enabled_plugins: Vec<String>,
}

#[tauri::command]
pub async fn get_settings() -> Result<FrontendSettings, String> {
    Ok(map_to_frontend(config::load_settings()))
}

#[tauri::command]
pub async fn save_settings(settings: FrontendSettings) -> Result<(), String> {
    config::save_settings(&map_from_frontend(settings))
}

fn map_to_frontend(settings: RhythmSettings) -> FrontendSettings {
    let provider_id = settings.llm.provider.clone();
    let provider_name = settings.llm.provider.clone();
    let provider_model = FrontendProviderModel {
        id: settings.llm.model.clone(),
        name: settings.llm.model.clone(),
        is_default: true,
        enabled: true,
        note: Some("来自当前后端配置".to_string()),
    };

    FrontendSettings {
        theme: "system".to_string(),
        auto_save_sessions: true,
        providers: vec![FrontendProviderConfig {
            id: provider_id.clone(),
            name: provider_name,
            base_url: settings.llm.base_url.clone(),
            api_key: settings.llm.api_key.clone(),
            is_default: true,
            models: vec![provider_model],
        }],
        max_turns: settings.max_turns,
        system_prompt: settings.system_prompt.unwrap_or_default(),
        permission_mode: match settings.permission.mode {
            crate::permissions::modes::PermissionMode::Default => "default".to_string(),
            crate::permissions::modes::PermissionMode::Plan => "plan".to_string(),
            crate::permissions::modes::PermissionMode::FullAuto => "full_auto".to_string(),
        },
        allowed_tools: settings.permission.allowed_tools.clone(),
        denied_tools: settings.permission.denied_tools.clone(),
        path_rules: settings
            .permission
            .path_rules
            .iter()
            .map(|rule| format!("{}: {}", if rule.allow { "allow" } else { "deny" }, rule.pattern))
            .collect(),
        denied_commands: settings.permission.denied_commands.clone(),
        memory_enabled: settings.memory.enabled,
        memory_max_files: settings.memory.max_files,
        memory_max_entrypoint_lines: settings.memory.max_entrypoint_lines,
        hooks: flatten_hooks(&settings.hooks),
        mcp_servers: settings
            .mcp_servers
            .iter()
            .map(|(name, server)| match server {
                crate::mcp::types::McpServerConfig::Stdio(cfg) => FrontendMcpServerConfig {
                    id: name.clone(),
                    name: name.clone(),
                    transport: "stdio".to_string(),
                    endpoint: cfg.command.clone(),
                    enabled: true,
                },
                crate::mcp::types::McpServerConfig::Http(cfg) => FrontendMcpServerConfig {
                    id: name.clone(),
                    name: name.clone(),
                    transport: "http".to_string(),
                    endpoint: cfg.url.clone(),
                    enabled: true,
                },
                crate::mcp::types::McpServerConfig::Ws(cfg) => FrontendMcpServerConfig {
                    id: name.clone(),
                    name: name.clone(),
                    transport: "http".to_string(),
                    endpoint: cfg.url.clone(),
                    enabled: true,
                },
            })
            .collect(),
        auto_compact_enabled: settings.auto_compact.enabled,
        auto_compact_threshold_ratio: settings.auto_compact.threshold_ratio,
        auto_compact_max_micro_compacts: settings.auto_compact.max_micro_compacts,
        enabled_plugins: settings
            .enabled_plugins
            .iter()
            .filter_map(|(name, enabled)| enabled.then_some(name.clone()))
            .collect(),
    }
}

fn map_from_frontend(settings: FrontendSettings) -> RhythmSettings {
    let provider = settings.providers.first();
    let model = provider.and_then(|p| p.models.first());

    RhythmSettings {
        llm: config::LlmConfig {
            provider: provider.map(|p| p.id.clone()).unwrap_or_else(|| "openai".to_string()),
            base_url: provider.map(|p| p.base_url.clone()).unwrap_or_default(),
            api_key: provider.map(|p| p.api_key.clone()).unwrap_or_default(),
            model: model.map(|m| m.name.clone()).unwrap_or_else(|| "gpt-5.4".to_string()),
            max_tokens: None,
        },
        max_turns: settings.max_turns,
        system_prompt: if settings.system_prompt.trim().is_empty() { None } else { Some(settings.system_prompt) },
        permission: config::PermissionConfig {
            mode: crate::permissions::modes::PermissionMode::from_str(&settings.permission_mode),
            allowed_tools: settings.allowed_tools,
            denied_tools: settings.denied_tools,
            path_rules: settings
                .path_rules
                .into_iter()
                .map(|line| {
                    let (allow, pattern) = if let Some(rest) = line.strip_prefix("deny:") {
                        (false, rest.trim().to_string())
                    } else if let Some(rest) = line.strip_prefix("allow:") {
                        (true, rest.trim().to_string())
                    } else {
                        (true, line.trim().to_string())
                    };
                    config::PathRuleConfig { pattern, allow }
                })
                .collect(),
            denied_commands: settings.denied_commands,
        },
        memory: config::MemoryConfig {
            enabled: settings.memory_enabled,
            max_files: settings.memory_max_files,
            max_entrypoint_lines: settings.memory_max_entrypoint_lines,
        },
        hooks: inflate_hooks(settings.hooks),
        mcp_servers: settings
            .mcp_servers
            .into_iter()
            .map(|server| {
                let config = if server.transport == "stdio" {
                    crate::mcp::types::McpServerConfig::Stdio(crate::mcp::types::McpStdioServerConfig {
                        command: server.endpoint.clone(),
                        args: vec![],
                        env: HashMap::new(),
                        cwd: None,
                    })
                } else {
                    crate::mcp::types::McpServerConfig::Http(crate::mcp::types::McpHttpServerConfig {
                        url: server.endpoint.clone(),
                        headers: HashMap::new(),
                    })
                };
                (server.name, config)
            })
            .collect::<HashMap<_, _>>(),
        auto_compact: config::AutoCompactConfig {
            enabled: settings.auto_compact_enabled,
            threshold_ratio: settings.auto_compact_threshold_ratio,
            max_micro_compacts: settings.auto_compact_max_micro_compacts,
        },
        enabled_plugins: settings
            .enabled_plugins
            .into_iter()
            .map(|name| (name, true))
            .collect(),
    }
}

fn flatten_hooks(hooks: &HooksConfig) -> Vec<FrontendHookConfig> {
    let mut result = vec![];
    append_hooks("pre_tool_use", &hooks.pre_tool_use, &mut result);
    append_hooks("post_tool_use", &hooks.post_tool_use, &mut result);
    append_hooks("session_start", &hooks.session_start, &mut result);
    append_hooks("session_end", &hooks.session_end, &mut result);
    result
}

fn append_hooks(stage: &str, hooks: &[HookConfig], out: &mut Vec<FrontendHookConfig>) {
    for (index, hook) in hooks.iter().enumerate() {
        match hook {
            HookConfig::Command(command) => out.push(FrontendHookConfig {
                id: format!("{}-{}", stage, index),
                stage: stage.to_string(),
                hook_type: "command".to_string(),
                matcher: command.matcher.clone().unwrap_or_default(),
                timeout: command.timeout_secs,
                block_on_failure: command.block_on_failure,
            }),
            HookConfig::Http(http) => out.push(FrontendHookConfig {
                id: format!("{}-{}", stage, index),
                stage: stage.to_string(),
                hook_type: "http".to_string(),
                matcher: http.matcher.clone().unwrap_or_default(),
                timeout: http.timeout_secs,
                block_on_failure: http.block_on_failure,
            }),
        }
    }
}

fn inflate_hooks(hooks: Vec<FrontendHookConfig>) -> HooksConfig {
    let mut config = HooksConfig::default();
    for hook in hooks {
        let mapped = if hook.hook_type == "http" {
            HookConfig::Http(HttpHookConfig {
                url: String::new(),
                headers: HashMap::new(),
                timeout_secs: hook.timeout,
                matcher: Some(hook.matcher),
                block_on_failure: hook.block_on_failure,
            })
        } else {
            HookConfig::Command(CommandHookConfig {
                command: String::new(),
                timeout_secs: hook.timeout,
                matcher: Some(hook.matcher),
                block_on_failure: hook.block_on_failure,
            })
        };

        match hook.stage.as_str() {
            "pre_tool_use" => config.pre_tool_use.push(mapped),
            "post_tool_use" => config.post_tool_use.push(mapped),
            "session_start" => config.session_start.push(mapped),
            "session_end" => config.session_end.push(mapped),
            _ => {}
        }
    }
    config
}
