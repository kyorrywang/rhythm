use super::types::{PluginManifest, PluginSource, PluginStatus, PluginSummary};
use crate::infra::paths;
use crate::shared::error::RhythmError;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
pub struct PluginInstallPreview {
    pub name: String,
    pub version: String,
    pub description: String,
    pub source_path: String,
    pub destination_path: String,
    pub will_overwrite: bool,
    pub main: Option<String>,
    pub dev_main: Option<String>,
    pub permissions: Vec<String>,
    pub requires: super::types::PluginRequires,
    pub contributes: super::types::PluginContributions,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginUninstallStoragePolicy {
    Keep,
    Delete,
}

/// Read a plugin manifest from a source directory without copying files.
pub fn preview_install_plugin(source: &Path) -> Result<PluginInstallPreview, RhythmError> {
    let src = source.canonicalize().map_err(RhythmError::IoError)?;
    let manifest = read_manifest(&src)?;
    let dest = paths::get_rhythm_dir().join("plugins").join(&manifest.name);
    let mut warnings = Vec::new();
    if manifest.entry.as_deref() != Some("dist/main.js") {
        warnings.push("main should be dist/main.js for formal plugin loading".to_string());
    }
    if manifest.dev.main.as_deref() != Some("src/main.tsx") {
        warnings.push("dev.main should be src/main.tsx for development loading".to_string());
    }
    if let Some(main) = &manifest.entry {
        if !src.join(main).exists() {
            warnings.push(format!("main entry does not exist: {}", main));
        }
    }
    if let Some(dev_main) = &manifest.dev.main {
        if !src.join(dev_main).exists() {
            warnings.push(format!("dev.main entry does not exist: {}", dev_main));
        }
    }

    Ok(PluginInstallPreview {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        source_path: src.to_string_lossy().to_string(),
        destination_path: dest.to_string_lossy().to_string(),
        will_overwrite: dest.exists(),
        main: manifest.entry,
        dev_main: manifest.dev.main,
        permissions: manifest.permissions,
        requires: manifest.requires,
        contributes: manifest.contributes,
        warnings,
    })
}

/// Copy a plugin directory into `~/.rhythm/plugins/<dir_name>`.
/// Overwrites any existing plugin with the same directory name.
pub fn install_plugin(source: &Path) -> Result<PluginSummary, RhythmError> {
    let src = source.canonicalize().map_err(RhythmError::IoError)?;
    let manifest = read_manifest(&src)?;
    let name = manifest.name.clone();

    let dest = paths::get_rhythm_dir().join("plugins").join(&name);

    // Ensure plugins directory exists
    crate::infra::paths::ensure_dir(&dest.parent().unwrap()).map_err(RhythmError::IoError)?;

    // Remove existing installation if present
    if dest.exists() {
        std::fs::remove_dir_all(&dest).map_err(RhythmError::IoError)?;
    }

    copy_dir_all(&src, &dest)?;

    Ok(PluginSummary {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        source: PluginSource::Global,
        installed: true,
        is_active: true,
        shadowed_by: None,
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
        agents_count: 0,
        path: dest.to_string_lossy().to_string(),
        main: manifest.entry.clone(),
        dev_main: manifest.dev.main.clone(),
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
pub fn uninstall_plugin(
    name: &str,
    storage_policy: PluginUninstallStoragePolicy,
) -> Result<bool, RhythmError> {
    let path = paths::get_rhythm_dir().join("plugins").join(name);
    if !path.exists() {
        return Ok(false);
    }
    std::fs::remove_dir_all(&path).map_err(RhythmError::IoError)?;
    if matches!(storage_policy, PluginUninstallStoragePolicy::Delete) {
        remove_plugin_storage_dirs(name)?;
    }
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

fn read_manifest(src: &Path) -> Result<PluginManifest, RhythmError> {
    let manifest_path = src.join("plugin.json");
    let manifest_text = std::fs::read_to_string(&manifest_path).map_err(RhythmError::IoError)?;
    serde_json::from_str(&manifest_text).map_err(|e| RhythmError::ConfigError(e.to_string()))
}

fn remove_plugin_storage_dirs(name: &str) -> Result<(), RhythmError> {
    let workspaces_dir = paths::get_data_dir().join("workspaces");
    if !workspaces_dir.exists() {
        return Ok(());
    }
    for workspace in std::fs::read_dir(workspaces_dir).map_err(RhythmError::IoError)? {
        let workspace = workspace.map_err(RhythmError::IoError)?;
        let plugin_storage = workspace
            .path()
            .join("plugins")
            .join(sanitize_path_segment(name));
        if plugin_storage.exists() {
            std::fs::remove_dir_all(plugin_storage).map_err(RhythmError::IoError)?;
        }
    }
    Ok(())
}

fn sanitize_path_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => ch,
        })
        .collect::<String>();

    if sanitized.trim().is_empty() {
        "plugin".to_string()
    } else {
        sanitized
    }
}
