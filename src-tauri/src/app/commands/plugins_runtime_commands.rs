use tauri::ipc::Channel;
use tokio::sync::oneshot;

use super::execution::{is_shell_tool_command, rand_suffix, run_shell_stream_command};
use super::storage::find_preferred_plugin;
use super::{
    PluginCommandCancelRequest, PluginCommandEvent, PluginCommandRequest, PluginCommandResponse,
    PluginCommandStartResponse, PluginRuntimeInfo, PLUGIN_COMMAND_RUNS,
};
use crate::infra::{config, paths};
use crate::runtime::extensions::{self};

/// Return workspace-scoped runtime information for one enabled plugin.
#[tauri::command]
pub async fn plugin_runtime_info(
    cwd: String,
    plugin_name: String,
) -> Result<PluginRuntimeInfo, String> {
    let cwd_path =
        crate::runtime::context::workspace::application::resolve_workspace_path(Some(&cwd))?;
    let settings = config::load_settings();
    let loaded = extensions::load_plugins(&settings, &cwd_path);
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
    let cwd_path = crate::runtime::context::workspace::application::resolve_workspace_path(Some(
        &request.cwd,
    ))?;
    let settings = config::load_settings();
    let loaded = extensions::load_plugins(&settings, &cwd_path);
    let registry = extensions::PluginCommandRegistry::from_plugins(&loaded);
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
    let cwd_path = crate::runtime::context::workspace::application::resolve_workspace_path(Some(
        &request.cwd,
    ))?;
    let settings = config::load_settings();
    let loaded = extensions::load_plugins(&settings, &cwd_path);
    let registry = extensions::PluginCommandRegistry::from_plugins(&loaded);
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
