use crate::infrastructure::config;
use crate::infrastructure::paths;
use crate::plugins::PluginStatus;
use crate::plugins::{self, PluginSummary};
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::LazyLock;
use std::time::Instant;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::{mpsc, oneshot, Mutex};

static PLUGIN_COMMAND_RUNS: LazyLock<Mutex<HashMap<String, oneshot::Sender<()>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

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
    let cwd_path = crate::commands::workspace::resolve_workspace_path(Some(&cwd))?;
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

#[tauri::command]
pub async fn plugin_start_command(
    request: PluginCommandRequest,
    on_event: Channel<PluginCommandEvent>,
) -> Result<PluginCommandStartResponse, String> {
    let cwd_path = crate::commands::workspace::resolve_workspace_path(Some(&request.cwd))?;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn resolve_enabled_plugin_storage_dir(
    cwd: &str,
    plugin_name: &str,
) -> Result<std::path::PathBuf, String> {
    let cwd_path = crate::commands::workspace::resolve_workspace_path(Some(cwd))?;
    let settings = config::load_settings();
    let loaded = plugins::load_plugins(&settings, &cwd_path);
    let plugin = find_preferred_plugin(&loaded, plugin_name)
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

fn find_preferred_plugin<'a>(
    loaded: &'a [plugins::LoadedPlugin],
    plugin_name: &str,
) -> Option<&'a plugins::LoadedPlugin> {
    loaded
        .iter()
        .find(|entry| entry.name() == plugin_name && entry.is_active)
        .or_else(|| loaded.iter().find(|entry| entry.name() == plugin_name))
}

fn set_plugin_enabled(name: &str, enabled: bool) -> Result<(), String> {
    let mut settings = config::load_settings();
    settings.core.plugins.enabled.insert(name.to_string(), enabled);
    config::save_settings(&settings)
}

fn set_plugin_permission(
    name: &str,
    permission: &str,
    granted: bool,
    cwd: Option<&str>,
) -> Result<(), String> {
    let mut settings = config::load_settings();
    let key = match cwd {
        Some(cwd) => {
            let cwd_path = crate::commands::workspace::resolve_workspace_path(Some(cwd))?;
            crate::plugins::loader::workspace_permission_key(&cwd_path, name)
        }
        None => name.to_string(),
    };
    let permissions = settings.core.plugins.permissions.entry(key).or_default();
    if granted {
        if !permissions.iter().any(|entry| entry == permission) {
            permissions.push(permission.to_string());
        }
    } else {
        permissions.retain(|entry| entry != permission);
    }
    config::save_settings(&settings)
}

fn rand_suffix() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| format!("{:06x}", (duration.as_nanos() & 0xFF_FFFF) as u64))
        .unwrap_or_else(|_| "000000".to_string())
}

fn is_shell_tool_command(resolved: &plugins::ResolvedPluginCommand) -> bool {
    resolved
        .definition
        .tool
        .as_deref()
        .map(plugins::resolve_builtin_tool_alias)
        == Some("shell")
}

async fn run_shell_stream_command(
    run_id: String,
    input: Value,
    cwd_path: &std::path::Path,
    on_event: Channel<PluginCommandEvent>,
    mut cancel_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    let command = input
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| "tool.shell requires a string 'command'".to_string())?
        .to_string();
    let timeout_ms = input.get("timeout_ms").and_then(Value::as_u64);
    let max_output_bytes = input
        .get("max_output_bytes")
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(256 * 1024);

    let mut child = if cfg!(target_os = "windows") {
        TokioCommand::new("cmd")
            .args(["/C", &command])
            .current_dir(cwd_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    } else {
        TokioCommand::new("sh")
            .args(["-c", &command])
            .current_dir(cwd_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    }
    .map_err(|e| format!("Cannot start shell command: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Cannot capture shell stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Cannot capture shell stderr".to_string())?;

    let (line_tx, mut line_rx) = mpsc::unbounded_channel::<(bool, String)>();
    spawn_reader(stdout, true, line_tx.clone());
    spawn_reader(stderr, false, line_tx);

    let started_at = Instant::now();
    let mut stdout_text = String::new();
    let mut stderr_text = String::new();
    let mut truncated = false;
    let mut timed_out = false;
    let mut timeout = timeout_ms
        .map(std::time::Duration::from_millis)
        .map(tokio::time::sleep)
        .map(Box::pin);

    loop {
        tokio::select! {
            _ = &mut cancel_rx => {
                let _ = child.kill().await;
                let _ = on_event.send(PluginCommandEvent::Cancelled { run_id });
                return Ok(());
            }
            _ = async {
                if let Some(timeout) = timeout.as_mut() {
                    timeout.as_mut().await;
                }
            }, if timeout.is_some() => {
                timed_out = true;
                let _ = child.kill().await;
            }
            Some((is_stdout, chunk)) = line_rx.recv() => {
                let total_len = stdout_text.len() + stderr_text.len();
                let target = if is_stdout { &mut stdout_text } else { &mut stderr_text };
                if !truncated {
                    let remaining = max_output_bytes.saturating_sub(total_len);
                    if remaining == 0 {
                        truncated = true;
                    } else {
                        let accepted = if chunk.len() > remaining {
                            truncated = true;
                            chunk[..remaining].to_string()
                        } else {
                            chunk.clone()
                        };
                        target.push_str(&accepted);
                    }
                }
                let _ = on_event.send(if is_stdout {
                    PluginCommandEvent::Stdout { run_id: run_id.clone(), chunk }
                } else {
                    PluginCommandEvent::Stderr { run_id: run_id.clone(), chunk }
                });
            }
            status = child.wait() => {
                let status = status.map_err(|e| format!("Shell command failed: {}", e))?;
                while let Ok((is_stdout, chunk)) = line_rx.try_recv() {
                    let total_len = stdout_text.len() + stderr_text.len();
                    let target = if is_stdout { &mut stdout_text } else { &mut stderr_text };
                    if !truncated {
                        let remaining = max_output_bytes.saturating_sub(total_len);
                        if remaining == 0 {
                            truncated = true;
                        } else {
                            let accepted = if chunk.len() > remaining {
                                truncated = true;
                                chunk[..remaining].to_string()
                            } else {
                                chunk.clone()
                            };
                            target.push_str(&accepted);
                        }
                    }
                    let _ = on_event.send(if is_stdout {
                        PluginCommandEvent::Stdout { run_id: run_id.clone(), chunk }
                    } else {
                        PluginCommandEvent::Stderr { run_id: run_id.clone(), chunk }
                    });
                }
                let exit_code = if timed_out { -1 } else { status.code().unwrap_or(-1) };
                let success = !timed_out && status.success();
                let result = serde_json::json!({
                    "command": command,
                    "stdout": stdout_text,
                    "stderr": stderr_text,
                    "exit_code": exit_code,
                    "success": success,
                    "timed_out": timed_out,
                    "truncated": truncated,
                    "duration_ms": started_at.elapsed().as_millis() as u64,
                });
                let _ = on_event.send(PluginCommandEvent::Completed { run_id, result });
                return Ok(());
            }
        }
    }
}

fn spawn_reader<R>(reader: R, is_stdout: bool, tx: mpsc::UnboundedSender<(bool, String)>)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx.send((is_stdout, format!("{}\n", line)));
        }
    });
}
