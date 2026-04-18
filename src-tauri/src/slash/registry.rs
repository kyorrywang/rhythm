use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::types::{
    SlashCommandDescriptor, SlashCommandRegistryResponse, SlashEntryRef, SlashHandlerRef,
    SlashProviderRef,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlashCommandFile {
    name: String,
    title: Option<String>,
    description: Option<String>,
    kind: Option<String>,
    provider: SlashProviderRef,
    entry: SlashEntryRef,
    handler: SlashHandlerRef,
    context_policy: Option<String>,
    default_skill: Option<String>,
}

pub fn load_slash_command_registry(workspace_path: &Path) -> SlashCommandRegistryResponse {
    let mut commands = HashMap::<String, SlashCommandDescriptor>::new();
    let mut warnings = Vec::new();

    for command in load_builtin_slash_commands(&mut warnings) {
        commands.insert(command.name.clone(), command);
    }

    load_plugin_slash_commands(workspace_path, &mut commands, &mut warnings);

    let mut command_list = commands.into_values().collect::<Vec<_>>();
    command_list.sort_by(|left, right| left.name.cmp(&right.name));
    warnings.sort();

    SlashCommandRegistryResponse {
        commands: command_list,
        warnings,
    }
}

pub fn resolve_slash_command(
    workspace_path: &Path,
    name: &str,
) -> Result<Option<SlashCommandDescriptor>, String> {
    Ok(load_slash_command_registry(workspace_path)
        .commands
        .into_iter()
        .find(|command| command.name.eq_ignore_ascii_case(name)))
}

fn load_builtin_slash_commands(warnings: &mut Vec<String>) -> Vec<SlashCommandDescriptor> {
    let mut commands = Vec::new();
    let builtin_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("slash")
        .join("builtin");
    let entries = match fs::read_dir(&builtin_root) {
        Ok(entries) => entries,
        Err(error) => {
            warnings.push(format!(
                "无法读取 builtin slash 目录 '{}': {}",
                builtin_root.display(),
                error
            ));
            return commands;
        }
    };

    for entry in entries.flatten() {
        let command_path = entry.path().join("command.json");
        if !command_path.is_file() {
            continue;
        }

        match parse_command_file(&command_path) {
            Ok(command) => commands.push(command),
            Err(error) => warnings.push(error),
        }
    }
    commands
}

fn load_plugin_slash_commands(
    workspace_path: &Path,
    commands: &mut HashMap<String, SlashCommandDescriptor>,
    warnings: &mut Vec<String>,
) {
    let settings = crate::infrastructure::config::load_settings();
    let plugins = crate::plugins::loader::load_plugins(&settings, workspace_path);

    for plugin in plugins.iter().filter(|plugin| plugin.is_runtime_active()) {
        let Some(slash) = plugin.slash_contribution.as_ref() else {
            continue;
        };
        let command_dir = plugin.path.join(&slash.commands_dir);

        let entries = match fs::read_dir(&command_dir) {
            Ok(entries) => entries,
            Err(error) => {
                warnings.push(format!(
                    "无法读取插件 slash commands 目录 '{}': {}",
                    command_dir.display(),
                    error
                ));
                continue;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !is_supported_command_file(&path) {
                continue;
            }
            match parse_command_file(&path) {
                Ok(command) => {
                    commands.insert(command.name.clone(), command);
                }
                Err(error) => warnings.push(error),
            }
        }
    }
}

fn parse_command_file(path: &Path) -> Result<SlashCommandDescriptor, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("无法读取命令文件 '{}': {}", path.display(), error))?;
    let parsed: SlashCommandFile = serde_json::from_str(&content)
        .map_err(|error| format!("命令文件 '{}' 不是有效 JSON: {}", path.display(), error))?;
    parse_command_definition(path, parsed)
}

fn parse_command_definition(
    path: &Path,
    parsed: SlashCommandFile,
) -> Result<SlashCommandDescriptor, String> {
    let name = normalize_command_name(&parsed.name)
        .ok_or_else(|| format!("命令文件 '{}' 缺少有效 name", path.display()))?;
    let kind = parsed.kind.unwrap_or_else(|| "mode".to_string());
    if kind != "mode" && kind != "workflow" {
        return Err(format!(
            "命令文件 '{}' 使用了暂不支持的 kind '{}'",
            path.display(),
            kind
        ));
    }

    if parsed.provider.provider_type != "builtin" && parsed.provider.provider_type != "plugin" {
        return Err(format!(
            "命令文件 '{}' 使用了无效 provider.type '{}'",
            path.display(),
            parsed.provider.provider_type
        ));
    }

    if parsed.entry.id.trim().is_empty() {
        return Err(format!("命令文件 '{}' 缺少有效 entry.id", path.display()));
    }
    if parsed.handler.id.trim().is_empty() {
        return Err(format!("命令文件 '{}' 缺少有效 handler.id", path.display()));
    }

    let context_policy = parsed
        .context_policy
        .unwrap_or_else(|| "default".to_string());
    if context_policy != "default" && context_policy != "exclude" {
        return Err(format!(
            "命令文件 '{}' 使用了无效的 contextPolicy '{}'",
            path.display(),
            context_policy
        ));
    }

    Ok(SlashCommandDescriptor {
        name,
        title: parsed.title.unwrap_or_else(|| parsed.name.clone()),
        description: parsed.description.unwrap_or_default(),
        kind,
        provider: parsed.provider,
        entry: parsed.entry,
        handler: parsed.handler,
        context_policy,
        default_skill: parsed.default_skill,
        source_path: Some(path.to_string_lossy().to_string()),
    })
}

fn normalize_command_name(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_start_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == ':')
    {
        return None;
    }
    Some(trimmed.to_ascii_lowercase())
}

fn is_supported_command_file(path: &PathBuf) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("json"))
            .unwrap_or(false)
}
