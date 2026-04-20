use super::storage::{
    read_plugin_storage_map, relative_plugin_storage_path, resolve_enabled_plugin_storage_dir,
    resolve_plugin_storage_file_path, write_plugin_storage_map,
};
use super::{
    PluginStorageFileRequest, PluginStorageGetRequest, PluginStorageSetRequest,
    PluginStorageTextFileSetRequest,
};

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
