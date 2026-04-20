use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::runtime::capabilities::tools::ToolExecutionContext;

use super::PluginRuntimeHost;

pub fn build_tool_context(
    host: &PluginRuntimeHost<'_>,
    session_id: &str,
    agent_id: &str,
    prefix: &str,
) -> ToolExecutionContext {
    let mut metadata = HashMap::new();
    if let Some(value) = host.definition_id {
        metadata.insert("agent_id".to_string(), Value::String((*value).to_string()));
    }
    if let Some(value) = host.provider_id {
        metadata.insert(
            "provider_id".to_string(),
            Value::String((*value).to_string()),
        );
    }
    if let Some(value) = host.model {
        metadata.insert("model".to_string(), Value::String((*value).to_string()));
    }
    if let Some(value) = host.reasoning {
        metadata.insert("reasoning".to_string(), Value::String((*value).to_string()));
    }

    ToolExecutionContext {
        cwd: host.cwd.to_path_buf(),
        agent_id: agent_id.to_string(),
        session_id: session_id.to_string(),
        tool_call_id: format!(
            "{}-{}-{}",
            prefix,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis(),
            host.caller_plugin
        ),
        metadata,
    }
}

pub fn rpc_error(id: Value, message: impl Into<String>) -> Value {
    serde_json::json!({
        "id": id,
        "ok": false,
        "error": {
            "message": message.into()
        }
    })
}

pub fn read_plugin_storage_map(
    storage_path: &Path,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let storage_file = storage_path.join("storage.json");
    if !storage_file.exists() {
        return Ok(serde_json::Map::new());
    }

    let text = std::fs::read_to_string(&storage_file).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(serde_json::Map::new());
    }

    let value: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(value.as_object().cloned().unwrap_or_default())
}

pub fn write_plugin_storage_map(
    storage_path: &Path,
    map: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    std::fs::create_dir_all(storage_path).map_err(|e| e.to_string())?;
    let storage_file = storage_path.join("storage.json");
    let text = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(storage_file, text).map_err(|e| e.to_string())
}

pub fn resolve_plugin_storage_path(
    storage_root: &PathBuf,
    relative: &str,
) -> Result<PathBuf, String> {
    if relative.trim().is_empty() {
        return Err("Plugin storage path cannot be empty".to_string());
    }
    crate::runtime::capabilities::tools::context::resolve_and_validate_path(storage_root, relative)
}
