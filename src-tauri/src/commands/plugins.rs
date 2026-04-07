use crate::infrastructure::config;
use crate::infrastructure::paths;
use crate::plugins::PluginStatus;
use crate::plugins::{self, PluginSummary};

#[derive(Debug, serde::Deserialize)]
pub struct PluginCommandRequest {
    pub cwd: String,
    pub plugin_name: String,
    pub command_id: String,
    #[serde(default)]
    pub input: serde_json::Value,
}

#[derive(Debug, serde::Deserialize)]
pub struct PluginStorageGetRequest {
    pub cwd: String,
    pub plugin_name: String,
    pub key: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct PluginStorageSetRequest {
    pub cwd: String,
    pub plugin_name: String,
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, serde::Deserialize)]
pub struct PluginStorageFileRequest {
    pub cwd: String,
    pub plugin_name: String,
    pub path: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct PluginStorageTextFileSetRequest {
    pub cwd: String,
    pub plugin_name: String,
    pub path: String,
    pub content: String,
}

#[derive(Debug, serde::Serialize)]
pub struct PluginRuntimeInfo {
    pub plugin_name: String,
    pub status: PluginStatus,
    pub enabled: bool,
    pub storage_path: String,
    pub capabilities: Vec<String>,
    pub commands: Vec<serde_json::Value>,
}

#[derive(Debug, serde::Serialize)]
pub struct PluginCommandResponse {
    pub plugin_name: String,
    pub command_id: String,
    pub handled: bool,
    pub result: serde_json::Value,
}

/// List all discoverable plugins (enabled and disabled) for the given cwd.
#[tauri::command]
pub async fn list_plugins(cwd: String) -> Result<Vec<PluginSummary>, String> {
    let settings = config::load_settings();
    let cwd_path = std::path::PathBuf::from(&cwd);
    let loaded = plugins::load_plugins(&settings, &cwd_path);
    Ok(loaded.iter().map(PluginSummary::from).collect())
}

/// Enable a plugin by name (persisted to settings.json).
#[tauri::command]
pub async fn enable_plugin(name: String) -> Result<(), String> {
    set_plugin_enabled(&name, true)
}

/// Disable a plugin by name (persisted to settings.json).
#[tauri::command]
pub async fn disable_plugin(name: String) -> Result<(), String> {
    set_plugin_enabled(&name, false)
}

#[tauri::command]
pub async fn grant_plugin_permission(
    name: String,
    permission: String,
    cwd: Option<String>,
) -> Result<(), String> {
    set_plugin_permission(&name, &permission, true, cwd.as_deref())
}

#[tauri::command]
pub async fn revoke_plugin_permission(
    name: String,
    permission: String,
    cwd: Option<String>,
) -> Result<(), String> {
    set_plugin_permission(&name, &permission, false, cwd.as_deref())
}

/// Install a plugin from the given source directory path into `~/.rhythm/plugins/`.
#[tauri::command]
pub async fn install_plugin_cmd(source_path: String) -> Result<PluginSummary, String> {
    plugins::install_plugin(std::path::Path::new(&source_path)).map_err(|e| e.to_string())
}

/// Uninstall a plugin by name.
#[tauri::command]
pub async fn uninstall_plugin_cmd(name: String) -> Result<bool, String> {
    plugins::uninstall_plugin(&name).map_err(|e| e.to_string())
}

/// Return workspace-scoped runtime information for one enabled plugin.
#[tauri::command]
pub async fn plugin_runtime_info(
    cwd: String,
    plugin_name: String,
) -> Result<PluginRuntimeInfo, String> {
    let cwd_path = crate::commands::workspace::resolve_workspace_path(Some(&cwd))?;
    let settings = config::load_settings();
    let loaded = plugins::load_plugins(&settings, &cwd_path);
    let plugin = loaded
        .iter()
        .find(|entry| entry.name() == plugin_name)
        .ok_or_else(|| format!("Plugin '{}' is not installed", plugin_name))?;
    let storage_path = paths::get_workspace_plugin_data_dir(&cwd_path, plugin.name());
    paths::ensure_dir(&storage_path).map_err(|e| e.to_string())?;

    Ok(PluginRuntimeInfo {
        plugin_name: plugin.name().to_string(),
        status: plugin.status,
        enabled: plugin.enabled,
        storage_path: storage_path.to_string_lossy().to_string(),
        capabilities: plugin.manifest.provides.capabilities.clone(),
        commands: plugin.manifest.contributes.commands.clone(),
    })
}

#[tauri::command]
pub async fn plugin_invoke_command(
    request: PluginCommandRequest,
) -> Result<PluginCommandResponse, String> {
    let cwd_path = crate::commands::workspace::resolve_workspace_path(Some(&request.cwd))?;
    let settings = config::load_settings();
    let loaded = plugins::load_plugins(&settings, &cwd_path);
    let registry = plugins::PluginCommandRegistry::from_plugins(&loaded);
    let execution = registry
        .execute(
            &loaded,
            &request.plugin_name,
            &request.command_id,
            request.input,
            &cwd_path,
        )
        .await?;

    Ok(PluginCommandResponse {
        plugin_name: execution.plugin_name,
        command_id: execution.command_id,
        handled: execution.handled,
        result: execution.result,
    })
}

/// Read a value from workspace-scoped plugin storage.
#[tauri::command]
pub async fn plugin_storage_get(
    request: PluginStorageGetRequest,
) -> Result<Option<serde_json::Value>, String> {
    let storage_path = resolve_enabled_plugin_storage_dir(&request.cwd, &request.plugin_name)?;
    let map = read_plugin_storage_map(&storage_path)?;
    Ok(map.get(&request.key).cloned())
}

/// Write a value to workspace-scoped plugin storage.
#[tauri::command]
pub async fn plugin_storage_set(request: PluginStorageSetRequest) -> Result<(), String> {
    let storage_path = resolve_enabled_plugin_storage_dir(&request.cwd, &request.plugin_name)?;
    let mut map = read_plugin_storage_map(&storage_path)?;
    map.insert(request.key, request.value);
    write_plugin_storage_map(&storage_path, &map)
}

/// Delete a value from workspace-scoped plugin storage.
#[tauri::command]
pub async fn plugin_storage_delete(request: PluginStorageGetRequest) -> Result<(), String> {
    let storage_path = resolve_enabled_plugin_storage_dir(&request.cwd, &request.plugin_name)?;
    let mut map = read_plugin_storage_map(&storage_path)?;
    map.remove(&request.key);
    write_plugin_storage_map(&storage_path, &map)
}

#[tauri::command]
pub async fn plugin_storage_read_text_file(
    request: PluginStorageFileRequest,
) -> Result<Option<String>, String> {
    let storage_path = resolve_enabled_plugin_storage_dir(&request.cwd, &request.plugin_name)?;
    let target = resolve_plugin_storage_file_path(&storage_path, &request.path)?;
    if !target.exists() {
        return Ok(None);
    }
    if !target.is_file() {
        return Err(format!(
            "Plugin storage path '{}' is not a file",
            request.path
        ));
    }
    std::fs::read_to_string(&target)
        .map(Some)
        .map_err(|e| format!("Cannot read plugin storage file '{}': {}", request.path, e))
}

#[tauri::command]
pub async fn plugin_storage_write_text_file(
    request: PluginStorageTextFileSetRequest,
) -> Result<(), String> {
    let storage_path = resolve_enabled_plugin_storage_dir(&request.cwd, &request.plugin_name)?;
    let target = resolve_plugin_storage_file_path(&storage_path, &request.path)?;
    if target.is_dir() {
        return Err(format!(
            "Plugin storage path '{}' is a directory",
            request.path
        ));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create plugin storage directory: {}", e))?;
    }
    std::fs::write(&target, request.content)
        .map_err(|e| format!("Cannot write plugin storage file '{}': {}", request.path, e))
}

#[tauri::command]
pub async fn plugin_storage_delete_file(request: PluginStorageFileRequest) -> Result<(), String> {
    let storage_path = resolve_enabled_plugin_storage_dir(&request.cwd, &request.plugin_name)?;
    let target = resolve_plugin_storage_file_path(&storage_path, &request.path)?;
    if !target.exists() {
        return Ok(());
    }
    if target.is_dir() {
        std::fs::remove_dir_all(&target).map_err(|e| {
            format!(
                "Cannot delete plugin storage directory '{}': {}",
                request.path, e
            )
        })
    } else {
        std::fs::remove_file(&target).map_err(|e| {
            format!(
                "Cannot delete plugin storage file '{}': {}",
                request.path, e
            )
        })
    }
}

#[tauri::command]
pub async fn plugin_storage_list_files(
    request: PluginStorageFileRequest,
) -> Result<Vec<String>, String> {
    let storage_path = resolve_enabled_plugin_storage_dir(&request.cwd, &request.plugin_name)?;
    let target = resolve_plugin_storage_file_path(&storage_path, &request.path)?;
    if !target.exists() {
        return Ok(Vec::new());
    }
    if !target.is_dir() {
        return Err(format!(
            "Plugin storage path '{}' is not a directory",
            request.path
        ));
    }

    let mut entries = std::fs::read_dir(&target)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .map(|entry| relative_plugin_storage_path(&storage_path, &entry.path()))
        .collect::<Vec<_>>();
    entries.sort();
    Ok(entries)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn resolve_enabled_plugin_storage_dir(
    cwd: &str,
    plugin_name: &str,
) -> Result<std::path::PathBuf, String> {
    let cwd_path = crate::commands::workspace::resolve_workspace_path(Some(cwd))?;
    let settings = config::load_settings();
    let loaded = plugins::load_plugins(&settings, &cwd_path);
    let plugin = loaded
        .iter()
        .find(|entry| entry.name() == plugin_name)
        .ok_or_else(|| format!("Plugin '{}' is not installed", plugin_name))?;

    if !plugin.enabled {
        return Err(plugin
            .blocked_reason
            .clone()
            .unwrap_or_else(|| format!("Plugin '{}' is not enabled", plugin.name())));
    }

    let storage_path = paths::get_workspace_plugin_data_dir(&cwd_path, plugin.name());
    paths::ensure_dir(&storage_path).map_err(|e| e.to_string())?;
    Ok(storage_path)
}

fn read_plugin_storage_map(
    storage_path: &std::path::Path,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let path = storage_path.join("storage.json");
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }

    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(serde_json::Map::new());
    }

    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(value.as_object().cloned().unwrap_or_default())
}

fn write_plugin_storage_map(
    storage_path: &std::path::Path,
    map: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    let path = storage_path.join("storage.json");
    let text = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

fn resolve_plugin_storage_file_path(
    storage_path: &std::path::PathBuf,
    path: &str,
) -> Result<std::path::PathBuf, String> {
    let relative = path.trim();
    if relative.is_empty() {
        return Err("Plugin storage path cannot be empty".to_string());
    }
    crate::tools::context::resolve_and_validate_path(storage_path, relative)
}

fn relative_plugin_storage_path(base: &std::path::Path, path: &std::path::Path) -> String {
    path.strip_prefix(base)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"))
}

fn set_plugin_enabled(name: &str, enabled: bool) -> Result<(), String> {
    let settings_path = crate::infrastructure::paths::get_settings_path();
    let text = std::fs::read_to_string(&settings_path).unwrap_or_default();
    let mut settings: config::RhythmSettings = serde_json::from_str(&text).unwrap_or_default();
    settings.enabled_plugins.insert(name.to_string(), enabled);
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn set_plugin_permission(
    name: &str,
    permission: &str,
    granted: bool,
    cwd: Option<&str>,
) -> Result<(), String> {
    let settings_path = crate::infrastructure::paths::get_settings_path();
    let text = std::fs::read_to_string(&settings_path).unwrap_or_default();
    let mut settings: config::RhythmSettings = serde_json::from_str(&text).unwrap_or_default();
    let key = match cwd {
        Some(cwd) => {
            let cwd_path = crate::commands::workspace::resolve_workspace_path(Some(cwd))?;
            crate::plugins::loader::workspace_permission_key(&cwd_path, name)
        }
        None => name.to_string(),
    };
    let permissions = settings.plugin_permissions.entry(key).or_default();
    if granted {
        if !permissions.iter().any(|entry| entry == permission) {
            permissions.push(permission.to_string());
        }
    } else {
        permissions.retain(|entry| entry != permission);
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, json).map_err(|e| e.to_string())?;
    Ok(())
}
