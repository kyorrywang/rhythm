use crate::infra::config;
use crate::runtime::extensions::PluginStatus;
use crate::runtime::extensions::{self, PluginSummary};
use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::sync::{oneshot, Mutex};

static PLUGIN_COMMAND_RUNS: LazyLock<Mutex<HashMap<String, oneshot::Sender<()>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[path = "plugins_execution.rs"]
mod execution;
#[path = "plugins_runtime_commands.rs"]
pub mod plugins_runtime_commands;
#[path = "plugins_storage_commands.rs"]
pub mod plugins_storage_commands;
#[path = "plugins_storage.rs"]
mod storage;

use storage::{set_plugin_enabled, set_plugin_permission};

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
    let loaded = extensions::load_plugins(&settings, &cwd_path);
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
    extensions::install_plugin(std::path::Path::new(&source_path)).map_err(|e| e.to_string())
}

/// Preview a plugin install without copying files.
#[tauri::command]
pub async fn preview_install_plugin_cmd(
    source_path: String,
) -> Result<extensions::PluginInstallPreview, String> {
    extensions::preview_install_plugin(std::path::Path::new(&source_path))
        .map_err(|e| e.to_string())
}

/// Uninstall a plugin by name.
#[tauri::command]
pub async fn uninstall_plugin_cmd(
    name: String,
    storage_policy: Option<extensions::PluginUninstallStoragePolicy>,
) -> Result<bool, String> {
    extensions::uninstall_plugin(
        &name,
        storage_policy.unwrap_or(extensions::PluginUninstallStoragePolicy::Keep),
    )
    .map_err(|e| e.to_string())
}

pub use plugins_runtime_commands::{
    plugin_cancel_command, plugin_invoke_command, plugin_runtime_info, plugin_start_command,
};
pub use plugins_storage_commands::{
    plugin_storage_delete, plugin_storage_delete_file, plugin_storage_get,
    plugin_storage_list_files, plugin_storage_read_text_file, plugin_storage_set,
    plugin_storage_write_text_file,
};
