use crate::infrastructure::config;
use crate::plugins::{self, PluginSummary};

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

/// Install a plugin from the given source directory path into `~/.rhythm/plugins/`.
#[tauri::command]
pub async fn install_plugin_cmd(source_path: String) -> Result<PluginSummary, String> {
    plugins::install_plugin(std::path::Path::new(&source_path))
        .map_err(|e| e.to_string())
}

/// Uninstall a plugin by name.
#[tauri::command]
pub async fn uninstall_plugin_cmd(name: String) -> Result<bool, String> {
    plugins::uninstall_plugin(&name).map_err(|e| e.to_string())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn set_plugin_enabled(name: &str, enabled: bool) -> Result<(), String> {
    let settings_path = crate::infrastructure::paths::get_settings_path();
    let text = std::fs::read_to_string(&settings_path).unwrap_or_default();
    let mut settings: config::RhythmSettings =
        serde_json::from_str(&text).unwrap_or_default();
    settings.enabled_plugins.insert(name.to_string(), enabled);
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, json).map_err(|e| e.to_string())?;
    Ok(())
}
