use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommandRecord {
    pub name: String,
    pub description: String,
    pub kind: String,
    pub context_policy: String,
    pub source: String,
    pub source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SlashCommandRegistryResponse {
    pub commands: Vec<SlashCommandRecord>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SlashCommandFile {
    name: String,
    description: Option<String>,
    kind: Option<String>,
    context_policy: Option<String>,
}

#[tauri::command]
pub async fn list_slash_commands(cwd: String) -> Result<SlashCommandRegistryResponse, String> {
    let workspace_path = crate::commands::workspace::resolve_workspace_path(Some(&cwd))?;
    Ok(load_slash_command_registry(&workspace_path))
}

pub fn load_slash_command_registry(workspace_path: &Path) -> SlashCommandRegistryResponse {
    let mut commands = HashMap::<String, SlashCommandRecord>::new();
    let mut warnings = Vec::new();

    let builtin = SlashCommandRecord {
        name: "btw".to_string(),
        description: "当前方式下的聊天不计入正常上下文".to_string(),
        kind: "mode".to_string(),
        context_policy: "exclude".to_string(),
        source: "builtin".to_string(),
        source_path: None,
    };
    commands.insert(builtin.name.clone(), builtin);

    load_command_dir(
        &crate::infrastructure::paths::get_rhythm_dir().join("commands"),
        "user",
        &mut commands,
        &mut warnings,
    );
    load_command_dir(
        &workspace_path.join(".rhythm").join("commands"),
        "workspace",
        &mut commands,
        &mut warnings,
    );

    let mut command_list = commands.into_values().collect::<Vec<_>>();
    command_list.sort_by(|left, right| left.name.cmp(&right.name));
    warnings.sort();

    SlashCommandRegistryResponse {
        commands: command_list,
        warnings,
    }
}

fn load_command_dir(
    dir: &Path,
    source: &str,
    commands: &mut HashMap<String, SlashCommandRecord>,
    warnings: &mut Vec<String>,
) {
    if !dir.exists() {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) => {
            warnings.push(format!("无法读取命令目录 '{}': {}", dir.display(), error));
            return;
        }
    };

    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        if !is_supported_command_file(&path) {
            continue;
        }

        match parse_command_file(&path, source) {
            Ok(command) => {
                commands.insert(command.name.clone(), command);
            }
            Err(error) => warnings.push(error),
        }
    }
}

fn parse_command_file(path: &Path, source: &str) -> Result<SlashCommandRecord, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("无法读取命令文件 '{}': {}", path.display(), error))?;
    let parsed: SlashCommandFile = serde_json::from_str(&content)
        .map_err(|error| format!("命令文件 '{}' 不是有效 JSON: {}", path.display(), error))?;

    let name = normalize_command_name(&parsed.name)
        .ok_or_else(|| format!("命令文件 '{}' 缺少有效 name", path.display()))?;
    let kind = parsed.kind.unwrap_or_else(|| "mode".to_string());
    if kind != "mode" {
        return Err(format!(
            "命令文件 '{}' 使用了暂不支持的 kind '{}'",
            path.display(),
            kind
        ));
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

    Ok(SlashCommandRecord {
        name,
        description: parsed.description.unwrap_or_default(),
        kind,
        context_policy,
        source: source.to_string(),
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
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
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
