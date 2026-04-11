use std::collections::HashMap;

use crate::infrastructure::config::{
    self, CommandHookConfig, HookConfig, HooksConfig, HttpHookConfig, RhythmSettings,
};

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
    #[serde(rename = "defaultProfileId")]
    pub default_profile_id: String,
    #[serde(rename = "defaultReasoning")]
    pub default_reasoning: String,
    #[serde(rename = "runtimeProfiles")]
    pub runtime_profiles: Vec<config::RuntimeProfile>,
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
    FrontendSettings {
        theme: settings.core.theme,
        theme_preset: settings.core.theme_preset,
        auto_save_sessions: settings.core.auto_save_sessions,
        providers: settings
            .models
            .providers
            .into_iter()
            .map(|provider| FrontendProviderConfig {
                id: provider.id,
                name: provider.name,
                provider: provider.provider,
                base_url: provider.base_url,
                api_key: provider.api_key,
                capabilities: provider.capabilities,
                models: provider
                    .models
                    .into_iter()
                    .map(|model| FrontendProviderModel {
                        id: model.id,
                        name: model.name,
                        enabled: model.enabled,
                        note: model.note,
                        capabilities: model.capabilities,
                    })
                    .collect(),
            })
            .collect(),
        system_prompt: settings.prompts.system_prompt.unwrap_or_default(),
        permission_mode: match settings.policies.permissions.mode {
            crate::permissions::modes::PermissionMode::Default => "default".to_string(),
            crate::permissions::modes::PermissionMode::Plan => "plan".to_string(),
            crate::permissions::modes::PermissionMode::FullAuto => "full_auto".to_string(),
        },
        allowed_tools: settings.policies.permissions.allowed_tools.clone(),
        denied_tools: settings.policies.permissions.denied_tools.clone(),
        path_rules: settings
            .policies
            .permissions
            .path_rules
            .iter()
            .map(|rule| {
                format!(
                    "{}: {}",
                    if rule.allow { "allow" } else { "deny" },
                    rule.pattern
                )
            })
            .collect(),
        denied_commands: settings.policies.permissions.denied_commands.clone(),
        memory_enabled: settings.core.memory.enabled,
        memory_max_files: settings.core.memory.max_files,
        memory_max_entrypoint_lines: settings.core.memory.max_entrypoint_lines,
        hooks: flatten_hooks(&settings.core.hooks),
        mcp_servers: settings
            .core
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
        enabled_plugins: settings
            .core
            .plugins
            .enabled
            .iter()
            .filter_map(|(name, enabled)| enabled.then_some(name.clone()))
            .collect(),
        default_profile_id: settings.profiles.default_profile_id,
        default_reasoning: settings.models.defaults.reasoning,
        runtime_profiles: settings.profiles.items,
    }
}

fn map_from_frontend(settings: FrontendSettings) -> RhythmSettings {
    let existing = config::load_settings();
    let providers = settings
        .providers
        .into_iter()
        .map(|provider| {
            let provider_format =
                resolve_provider_format(&provider).unwrap_or_else(|| "openai".to_string());
            config::ProviderConfig {
                id: provider.id,
                name: provider.name,
                provider: provider_format,
                base_url: provider.base_url,
                api_key: provider.api_key,
                capabilities: provider.capabilities,
                models: provider
                .models
                .into_iter()
                .map(|model| config::ProviderModelConfig {
                    id: model.id,
                    name: model.name,
                    enabled: model.enabled,
                    note: model.note,
                    capabilities: model.capabilities,
                })
                .collect(),
            }
        })
        .collect::<Vec<_>>();

    let mut bundle = existing.clone();
    bundle.core.theme = settings.theme;
    bundle.core.theme_preset = settings.theme_preset;
    bundle.core.auto_save_sessions = settings.auto_save_sessions;
    bundle.models.providers = providers;
    bundle.prompts.system_prompt = if settings.system_prompt.trim().is_empty() {
        None
    } else {
        Some(settings.system_prompt)
    };
    bundle.profiles.default_profile_id = settings.default_profile_id;
    bundle.models.defaults.reasoning = settings.default_reasoning;
    bundle.policies.permissions = config::PermissionConfig {
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
        };
    bundle.core.memory = config::MemoryConfig {
        enabled: settings.memory_enabled,
        max_files: settings.memory_max_files,
        max_entrypoint_lines: settings.memory_max_entrypoint_lines,
    };
    bundle.core.hooks = inflate_hooks(settings.hooks);
    bundle.profiles.items = settings.runtime_profiles;
    bundle.core.mcp_servers = settings
        .mcp_servers
        .into_iter()
        .map(|server| {
            let config = if server.transport == "stdio" {
                crate::mcp::types::McpServerConfig::Stdio(
                    crate::mcp::types::McpStdioServerConfig {
                        command: server.endpoint.clone(),
                        args: vec![],
                        env: HashMap::new(),
                        cwd: None,
                    },
                )
            } else {
                crate::mcp::types::McpServerConfig::Http(
                    crate::mcp::types::McpHttpServerConfig {
                        url: server.endpoint.clone(),
                        headers: HashMap::new(),
                    },
                )
            };
            (server.name, config)
        })
        .collect::<HashMap<_, _>>();
    bundle.core.plugins.enabled = settings
        .enabled_plugins
        .into_iter()
        .map(|name| (name, true))
        .collect();
    bundle
}

fn resolve_provider_format(provider: &FrontendProviderConfig) -> Option<String> {
    let explicit = provider.provider.trim();
    if !explicit.is_empty() {
        return Some(explicit.to_string());
    }

    let legacy_id = provider.id.trim();
    if matches!(legacy_id, "openai" | "anthropic") {
        return Some(legacy_id.to_string());
    }

    None
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
