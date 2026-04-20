use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::runtime::capabilities::tools::BaseTool;
use crate::runtime::extensions::types::LoadedPlugin;

#[path = "host_api_helpers.rs"]
mod helpers;

use helpers::{
    build_tool_context, read_plugin_storage_map, resolve_plugin_storage_path, rpc_error,
    write_plugin_storage_map,
};

pub struct PluginRuntimeHost<'a> {
    pub plugins: &'a [LoadedPlugin],
    pub caller_plugin: &'a str,
    pub cwd: &'a std::path::Path,
    pub plugin_storage_path: String,
    pub session_id: Option<&'a str>,
    pub agent_id: Option<&'a str>,
    pub definition_id: Option<&'a str>,
    pub provider_id: Option<&'a str>,
    pub model: Option<&'a str>,
    pub reasoning: Option<&'a str>,
}

pub async fn handle_runtime_rpc(value: &Value, host: Option<&PluginRuntimeHost<'_>>) -> Value {
    let id = value.get("id").cloned().unwrap_or(Value::Null);
    let method = value
        .get("method")
        .or_else(|| value.get("rpc"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    match method {
        "command.execute" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime host command bridge is unavailable");
            };
            let params = value
                .get("params")
                .or_else(|| value.get("input"))
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let Some(command_id) = params.get("commandId").and_then(Value::as_str) else {
                return rpc_error(id, "RPC command.execute is missing params.commandId");
            };
            let input = params.get("input").cloned().unwrap_or(Value::Null);
            let registry =
                crate::runtime::extensions::command_registry::PluginCommandRegistry::from_plugins(
                    host.plugins,
                );
            match Box::pin(registry.execute(
                host.plugins,
                host.caller_plugin,
                command_id,
                input,
                host.cwd,
            ))
            .await
            {
                Ok(execution) => serde_json::json!({
                    "id": id,
                    "ok": true,
                    "data": execution.result
                }),
                Err(error) => rpc_error(id, error),
            }
        }
        "workspace.readText" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime workspace bridge is unavailable");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let Some(path) = params.get("path").and_then(Value::as_str) else {
                return rpc_error(id, "RPC workspace.readText is missing params.path");
            };
            match crate::runtime::capabilities::tools::context::resolve_and_validate_path(
                &host.cwd.to_path_buf(),
                path,
            )
            .and_then(|resolved| {
                if !resolved.exists() {
                    return Ok(None);
                }
                std::fs::read_to_string(&resolved)
                    .map(Some)
                    .map_err(|error| format!("Cannot read file '{}': {}", path, error))
            }) {
                Ok(content) => serde_json::json!({ "id": id, "ok": true, "data": content }),
                Err(error) => rpc_error(id, error),
            }
        }
        "workspace.writeText" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime workspace bridge is unavailable");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let Some(path) = params.get("path").and_then(Value::as_str) else {
                return rpc_error(id, "RPC workspace.writeText is missing params.path");
            };
            let Some(content) = params.get("content").and_then(Value::as_str) else {
                return rpc_error(id, "RPC workspace.writeText is missing params.content");
            };
            match crate::runtime::capabilities::tools::context::resolve_and_validate_path(
                &host.cwd.to_path_buf(),
                path,
            ) {
                Ok(resolved) => {
                    if let Some(parent) = resolved.parent() {
                        if let Err(error) = std::fs::create_dir_all(parent) {
                            return rpc_error(
                                id,
                                format!("Cannot create directory for '{}': {}", path, error),
                            );
                        }
                    }
                    match std::fs::write(&resolved, content.as_bytes()) {
                        Ok(_) => {
                            serde_json::json!({ "id": id, "ok": true, "data": { "path": path } })
                        }
                        Err(error) => {
                            rpc_error(id, format!("Cannot write file '{}': {}", path, error))
                        }
                    }
                }
                Err(error) => rpc_error(id, error),
            }
        }
        "workspace.listDir" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime workspace bridge is unavailable");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let path = params.get("path").and_then(Value::as_str).unwrap_or(".");
            match crate::runtime::capabilities::tools::context::resolve_and_validate_path(
                &host.cwd.to_path_buf(),
                path,
            ) {
                Ok(resolved) => {
                    if !resolved.is_dir() {
                        return rpc_error(id, format!("'{}' is not a directory", path));
                    }
                    let mut entries = Vec::new();
                    match std::fs::read_dir(&resolved) {
                        Ok(items) => {
                            for entry in items.flatten() {
                                let entry_path = entry.path();
                                let kind = if entry_path.is_dir() {
                                    "directory"
                                } else {
                                    "file"
                                };
                                entries.push(serde_json::json!({
                                    "name": entry.file_name().to_string_lossy().to_string(),
                                    "path": entry_path.strip_prefix(host.cwd).unwrap_or(&entry_path).to_string_lossy().replace('\\', "/"),
                                    "kind": kind
                                }));
                            }
                            serde_json::json!({ "id": id, "ok": true, "data": entries })
                        }
                        Err(error) => {
                            rpc_error(id, format!("Cannot read directory '{}': {}", path, error))
                        }
                    }
                }
                Err(error) => rpc_error(id, error),
            }
        }
        "pluginStorage.get" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime storage bridge is unavailable");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let Some(key) = params.get("key").and_then(Value::as_str) else {
                return rpc_error(id, "RPC pluginStorage.get is missing params.key");
            };
            match read_plugin_storage_map(Path::new(&host.plugin_storage_path)) {
                Ok(map) => serde_json::json!({
                    "id": id,
                    "ok": true,
                    "data": map.get(key).cloned().unwrap_or(Value::Null),
                }),
                Err(error) => rpc_error(id, error),
            }
        }
        "pluginStorage.set" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime storage bridge is unavailable");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let Some(key) = params.get("key").and_then(Value::as_str) else {
                return rpc_error(id, "RPC pluginStorage.set is missing params.key");
            };
            let storage_path = Path::new(&host.plugin_storage_path);
            match read_plugin_storage_map(storage_path) {
                Ok(mut map) => {
                    map.insert(
                        key.to_string(),
                        params.get("value").cloned().unwrap_or(Value::Null),
                    );
                    match write_plugin_storage_map(storage_path, &map) {
                        Ok(_) => serde_json::json!({ "id": id, "ok": true, "data": true }),
                        Err(error) => rpc_error(id, error),
                    }
                }
                Err(error) => rpc_error(id, error),
            }
        }
        "pluginStorage.readText" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime storage bridge is unavailable");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let Some(path) = params.get("path").and_then(Value::as_str) else {
                return rpc_error(id, "RPC pluginStorage.readText is missing params.path");
            };
            let storage_root = PathBuf::from(&host.plugin_storage_path);
            match resolve_plugin_storage_path(&storage_root, path).and_then(|resolved| {
                if !resolved.exists() {
                    return Ok(None);
                }
                std::fs::read_to_string(&resolved)
                    .map(Some)
                    .map_err(|error| {
                        format!("Cannot read plugin storage file '{}': {}", path, error)
                    })
            }) {
                Ok(content) => serde_json::json!({ "id": id, "ok": true, "data": content }),
                Err(error) => rpc_error(id, error),
            }
        }
        "pluginStorage.writeText" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime storage bridge is unavailable");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let Some(path) = params.get("path").and_then(Value::as_str) else {
                return rpc_error(id, "RPC pluginStorage.writeText is missing params.path");
            };
            let Some(content) = params.get("content").and_then(Value::as_str) else {
                return rpc_error(id, "RPC pluginStorage.writeText is missing params.content");
            };
            let storage_root = PathBuf::from(&host.plugin_storage_path);
            match resolve_plugin_storage_path(&storage_root, path) {
                Ok(resolved) => {
                    if let Some(parent) = resolved.parent() {
                        if let Err(error) = std::fs::create_dir_all(parent) {
                            return rpc_error(
                                id,
                                format!("Cannot create plugin storage directory: {}", error),
                            );
                        }
                    }
                    match std::fs::write(&resolved, content.as_bytes()) {
                        Ok(_) => {
                            serde_json::json!({ "id": id, "ok": true, "data": { "path": path } })
                        }
                        Err(error) => rpc_error(
                            id,
                            format!("Cannot write plugin storage file '{}': {}", path, error),
                        ),
                    }
                }
                Err(error) => rpc_error(id, error),
            }
        }
        "pluginStorage.listFiles" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime storage bridge is unavailable");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let path = params.get("path").and_then(Value::as_str).unwrap_or(".");
            let storage_root = PathBuf::from(&host.plugin_storage_path);
            match resolve_plugin_storage_path(&storage_root, path) {
                Ok(resolved) => {
                    if !resolved.exists() {
                        return serde_json::json!({ "id": id, "ok": true, "data": Vec::<String>::new() });
                    }
                    if !resolved.is_dir() {
                        return rpc_error(
                            id,
                            format!("Plugin storage path '{}' is not a directory", path),
                        );
                    }
                    match std::fs::read_dir(&resolved) {
                        Ok(entries) => {
                            let mut items = entries
                                .flatten()
                                .map(|entry| {
                                    entry
                                        .path()
                                        .strip_prefix(&storage_root)
                                        .unwrap_or(&entry.path())
                                        .to_string_lossy()
                                        .replace('\\', "/")
                                })
                                .collect::<Vec<_>>();
                            items.sort();
                            serde_json::json!({ "id": id, "ok": true, "data": items })
                        }
                        Err(error) => rpc_error(
                            id,
                            format!("Cannot read plugin storage directory '{}': {}", path, error),
                        ),
                    }
                }
                Err(error) => rpc_error(id, error),
            }
        }
        "askUser" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime ask bridge is unavailable");
            };
            let Some(session_id) = host.session_id else {
                return rpc_error(id, "Plugin runtime ask bridge requires a session");
            };
            let Some(agent_id) = host.agent_id else {
                return rpc_error(id, "Plugin runtime ask bridge requires an agent");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let ctx = build_tool_context(host, session_id, agent_id, "slash-ask");
            match crate::runtime::capabilities::tools::ask::AskTool::execute_structured(
                params, &ctx,
            )
            .await
            {
                Ok(answer) => serde_json::json!({ "id": id, "ok": true, "data": answer }),
                Err(error) => rpc_error(id, error),
            }
        }
        "task.update" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime task bridge is unavailable");
            };
            let Some(session_id) = host.session_id else {
                return rpc_error(id, "Plugin runtime task bridge requires a session");
            };
            let Some(agent_id) = host.agent_id else {
                return rpc_error(id, "Plugin runtime task bridge requires an agent");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let tasks_value = params.get("tasks").cloned().unwrap_or(Value::Null);
            let tasks: Vec<crate::shared::schema::Task> = match serde_json::from_value(tasks_value)
            {
                Ok(tasks) => tasks,
                Err(error) => {
                    return rpc_error(id, format!("Invalid task update payload: {}", error))
                }
            };
            crate::infra::event_bus::emit(
                agent_id,
                session_id,
                crate::shared::schema::EventPayload::TaskUpdate {
                    tasks: tasks.clone(),
                },
            );
            serde_json::json!({ "id": id, "ok": true, "data": tasks })
        }
        "spawnSubagent" => {
            let Some(host) = host else {
                return rpc_error(id, "Plugin runtime subagent bridge is unavailable");
            };
            let Some(session_id) = host.session_id else {
                return rpc_error(id, "Plugin runtime subagent bridge requires a session");
            };
            let Some(agent_id) = host.agent_id else {
                return rpc_error(id, "Plugin runtime subagent bridge requires an agent");
            };
            let params = value
                .get("params")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let tool = crate::runtime::capabilities::tools::subagent::SubagentTool;
            let ctx = build_tool_context(host, session_id, agent_id, "slash-subagent");
            match Box::pin(tool.execute(params, &ctx)).await {
                result if result.is_error => rpc_error(id, result.output),
                result => serde_json::json!({ "id": id, "ok": true, "data": result.output }),
            }
        }
        other => rpc_error(
            id,
            format!("Unsupported plugin runtime RPC method '{}'", other),
        ),
    }
}
