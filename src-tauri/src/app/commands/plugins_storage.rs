use crate::infra::{config, paths};
use crate::runtime::extensions;

pub fn resolve_enabled_plugin_storage_dir(
    cwd: &str,
    plugin_name: &str,
) -> Result<std::path::PathBuf, String> {
    let cwd_path =
        crate::runtime::context::workspace::application::resolve_workspace_path(Some(cwd))?;
    let settings = config::load_settings();
    let loaded = extensions::load_plugins(&settings, &cwd_path);
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

pub fn read_plugin_storage_map(
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

pub fn write_plugin_storage_map(
    storage_path: &std::path::Path,
    map: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    let path = storage_path.join("storage.json");
    let text = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

pub fn resolve_plugin_storage_file_path(
    storage_path: &std::path::PathBuf,
    path: &str,
) -> Result<std::path::PathBuf, String> {
    let relative = path.trim();
    if relative.is_empty() {
        return Err("Plugin storage path cannot be empty".to_string());
    }
    crate::runtime::capabilities::tools::context::resolve_and_validate_path(storage_path, relative)
}

pub fn relative_plugin_storage_path(base: &std::path::Path, path: &std::path::Path) -> String {
    path.strip_prefix(base)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"))
}

pub fn find_preferred_plugin<'a>(
    loaded: &'a [extensions::LoadedPlugin],
    plugin_name: &str,
) -> Option<&'a extensions::LoadedPlugin> {
    loaded
        .iter()
        .find(|entry| entry.name() == plugin_name && entry.is_active)
        .or_else(|| loaded.iter().find(|entry| entry.name() == plugin_name))
}

pub fn set_plugin_enabled(name: &str, enabled: bool) -> Result<(), String> {
    let mut settings = config::load_settings();
    settings
        .core
        .plugins
        .enabled
        .insert(name.to_string(), enabled);
    config::save_settings(&settings)
}

pub fn set_plugin_permission(
    name: &str,
    permission: &str,
    granted: bool,
    cwd: Option<&str>,
) -> Result<(), String> {
    let mut settings = config::load_settings();
    let key = match cwd {
        Some(cwd) => {
            let cwd_path =
                crate::runtime::context::workspace::application::resolve_workspace_path(Some(cwd))?;
            crate::runtime::extensions::loader::workspace_permission_key(&cwd_path, name)
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
