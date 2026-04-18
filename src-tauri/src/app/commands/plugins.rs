use crate::domains::plugins::PluginStatus;
use crate::domains::plugins::{self, PluginSummary};
use crate::platform::config;
use crate::platform::paths;
use std::collections::HashMap;
use std::sync::LazyLock;
use tauri::ipc::Channel;
use tokio::sync::{oneshot, Mutex};

static PLUGIN_COMMAND_RUNS: LazyLock<Mutex<HashMap<String, oneshot::Sender<()>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[path = "plugins_storage.rs"]
mod storage;
#[path = "plugins_execution.rs"]
mod execution;

use execution::{is_shell_tool_command, rand_suffix, run_shell_stream_command};
use storage::{
    find_preferred_plugin, read_plugin_storage_map, relative_plugin_storage_path,
    resolve_enabled_plugin_storage_dir, resolve_plugin_storage_file_path, set_plugin_enabled,
    set_plugin_permission, write_plugin_storage_map,
};

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

#[derive(Debug, serde::Serialize)]
pub struct PluginCommandStartResponse {
    pub plugin_name: String,
    pub command_id: String,
    pub run_id: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct PluginCommandCancelRequest {
    pub run_id: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum PluginCommandEvent {
    #[serde(rename = "started")]
    Started {
        #[serde(rename = "runId")]
        run_id: String,
        #[serde(rename = "pluginName")]
        plugin_name: String,
        #[serde(rename = "commandId")]
        command_id: String,
    },
    #[serde(rename = "stdout")]
    Stdout {
        #[serde(rename = "runId")]
        run_id: String,
        chunk: String,
    },
    #[serde(rename = "stderr")]
    Stderr {
        #[serde(rename = "runId")]
        run_id: String,
        chunk: String,
    },
    #[serde(rename = "completed")]
    Completed {
        #[serde(rename = "runId")]
        run_id: String,
        result: serde_json::Value,
    },
    #[serde(rename = "error")]
    Error {
        #[serde(rename = "runId")]
        run_id: String,
        message: String,
    },
    #[serde(rename = "cancelled")]
    Cancelled {
        #[serde(rename = "runId")]
        run_id: String,
    },
}

/// List all discoverable plugins (enabled and disabled) for the given cwd.
#[tauri::command]
pub async fn list_plugins(cwd: String) -> Result<Vec<PluginSummary>, String> {
    let settings = config::load_settings();
    let cwd_path = std::path::PathBuf::from(&cwd);
    let loaded = plugins::load_plugins(&settings, &cwd_path);
    Ok(loaded.iter().map(PluginSummary::from).collect())
}

/// Enable a plugin by name (persisted to the unified config bundle).
#[tauri::command]
pub async fn enable_plugin(name: String) -> Result<(), String> {
    set_plugin_enabled(&name, true)
}

/// Disable a plugin by name (persisted to the unified config bundle).
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

/// Preview a plugin install without copying files.
#[tauri::command]
pub async fn preview_install_plugin_cmd(
    source_path: String,
) -> Result<plugins::PluginInstallPreview, String> {
    plugins::preview_install_plugin(std::path::Path::new(&source_path)).map_err(|e| e.to_string())
}

/// Uninstall a plugin by name.
#[tauri::command]
pub async fn uninstall_plugin_cmd(
    name: String,
    storage_policy: Option<plugins::PluginUninstallStoragePolicy>,
) -> Result<bool, String> {
    plugins::uninstall_plugin(
        &name,
        storage_policy.unwrap_or(plugins::PluginUninstallStoragePolicy::Keep),
    )
    .map_err(|e| e.to_string())
}

/// Return workspace-scoped runtime information for one enabled plugin.
#[tauri::command]
pub async fn plugin_runtime_info(
    cwd: String,
    plugin_name: String,
) -> Result<PluginRuntimeInfo, String> {
    let cwd_path = crate::domains::workspace::application::resolve_workspace_path(Some(&cwd))?;
    let settings = config::load_settings();
    let loaded = plugins::load_plugins(&settings, &cwd_path);
    let plugin = find_preferred_plugin(&loaded, &plugin_name)
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
    let cwd_path =
        crate::domains::workspace::application::resolve_workspace_path(Some(&request.cwd))?;
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

#[tauri::command]
pub async fn plugin_start_command(
    request: PluginCommandRequest,
    on_event: Channel<PluginCommandEvent>,
) -> Result<PluginCommandStartResponse, String> {
    let cwd_path =
        crate::domains::workspace::application::resolve_workspace_path(Some(&request.cwd))?;
    let settings = config::load_settings();
    let loaded = plugins::load_plugins(&settings, &cwd_path);
    let registry = plugins::PluginCommandRegistry::from_plugins(&loaded);
    let resolved = registry.resolve(
        &loaded,
        &request.plugin_name,
        &request.command_id,
        &request.input,
    )?;
    let run_id = format!(
        "plugin-run-{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default(),
        rand_suffix()
    );

    let response = PluginCommandStartResponse {
        plugin_name: resolved.provider_plugin.clone(),
        command_id: resolved.definition.id.clone(),
        run_id: run_id.clone(),
    };
    let _ = on_event.send(PluginCommandEvent::Started {
        run_id: run_id.clone(),
        plugin_name: response.plugin_name.clone(),
        command_id: response.command_id.clone(),
    });

    if is_shell_tool_command(&resolved) {
        let (cancel_tx, cancel_rx) = oneshot::channel();
        PLUGIN_COMMAND_RUNS
            .lock()
            .await
            .insert(run_id.clone(), cancel_tx);
        let event_channel = on_event.clone();
        tokio::spawn(async move {
            let result = run_shell_stream_command(
                run_id.clone(),
                request.input,
                &cwd_path,
                event_channel.clone(),
                cancel_rx,
            )
            .await;
            PLUGIN_COMMAND_RUNS.lock().await.remove(&run_id);
            if let Err(error) = result {
                let _ = event_channel.send(PluginCommandEvent::Error {
                    run_id,
                    message: error,
                });
            }
        });
        return Ok(response);
    }

    tokio::spawn(async move {
        match registry
            .execute_resolved(&loaded, &resolved, request.input, &cwd_path)
            .await
        {
            Ok(execution) => {
                let _ = on_event.send(PluginCommandEvent::Completed {
                    run_id,
                    result: execution.result,
                });
            }
            Err(error) => {
                let _ = on_event.send(PluginCommandEvent::Error {
                    run_id,
                    message: error,
                });
            }
        }
    });

    Ok(response)
}

#[tauri::command]
pub async fn plugin_cancel_command(request: PluginCommandCancelRequest) -> Result<bool, String> {
    let sender = PLUGIN_COMMAND_RUNS.lock().await.remove(&request.run_id);
    if let Some(sender) = sender {
        let _ = sender.send(());
        Ok(true)
    } else {
        Ok(false)
    }
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
