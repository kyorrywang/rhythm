use super::types::{PluginStatus, PluginSummary};
use crate::infrastructure::paths;
use crate::shared::error::RhythmError;
use std::path::Path;

/// Copy a plugin directory into `~/.rhythm/plugins/<dir_name>`.
/// Overwrites any existing plugin with the same directory name.
pub fn install_plugin(source: &Path) -> Result<PluginSummary, RhythmError> {
    let src = source.canonicalize().map_err(RhythmError::IoError)?;
    let name = src
        .file_name()
        .ok_or_else(|| RhythmError::ConfigError("Plugin source path has no directory name".into()))?
        .to_string_lossy()
        .to_string();

    let dest = paths::get_rhythm_dir().join("plugins").join(&name);

    // Ensure plugins directory exists
    crate::infrastructure::paths::ensure_dir(&dest.parent().unwrap())
        .map_err(RhythmError::IoError)?;

    // Remove existing installation if present
    if dest.exists() {
        std::fs::remove_dir_all(&dest).map_err(RhythmError::IoError)?;
    }

    copy_dir_all(&src, &dest)?;

    // Read manifest for summary
    let manifest_path = dest.join("plugin.json");
    let manifest_text = std::fs::read_to_string(&manifest_path).map_err(RhythmError::IoError)?;
    let manifest: super::types::PluginManifest = serde_json::from_str(&manifest_text)
        .map_err(|e| RhythmError::ConfigError(e.to_string()))?;

    Ok(PluginSummary {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        enabled: manifest.enabled_by_default,
        configured_enabled: manifest.enabled_by_default,
        status: if manifest.enabled_by_default {
            PluginStatus::Enabled
        } else {
            PluginStatus::Disabled
        },
        blocked_reason: None,
        skills_count: 0, // computed lazily on full load
        hooks_count: 0,
        mcp_servers_count: 0,
        path: dest.to_string_lossy().to_string(),
        main: manifest.entry.clone(),
        entry: manifest.entry,
        permissions: manifest.permissions.clone(),
        granted_permissions: if manifest.enabled_by_default {
            manifest.permissions
        } else {
            vec![]
        },
        requires: manifest.requires,
        provides: manifest.provides,
        contributes: manifest.contributes,
    })
}

/// Remove a plugin from `~/.rhythm/plugins/<name>`.
/// Returns `true` if the directory existed and was removed.
pub fn uninstall_plugin(name: &str) -> Result<bool, RhythmError> {
    let path = paths::get_rhythm_dir().join("plugins").join(name);
    if !path.exists() {
        return Ok(false);
    }
    std::fs::remove_dir_all(&path).map_err(RhythmError::IoError)?;
    Ok(true)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), RhythmError> {
    std::fs::create_dir_all(dst).map_err(RhythmError::IoError)?;
    for entry in std::fs::read_dir(src).map_err(RhythmError::IoError)? {
        let entry = entry.map_err(RhythmError::IoError)?;
        let ty = entry.file_type().map_err(RhythmError::IoError)?;
        let dest_child = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_child)?;
        } else {
            std::fs::copy(entry.path(), &dest_child).map_err(RhythmError::IoError)?;
        }
    }
    Ok(())
}
