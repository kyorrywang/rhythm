use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::types::{LoadedPlugin, PluginManifest, PluginSource, PluginStatus};
use crate::infra::config::RhythmSettings;
use crate::infra::paths;

#[path = "loader_support.rs"]
mod support;

use support::{
    load_plugin_agents, load_plugin_hooks, load_plugin_mcp, load_plugin_skills,
    resolve_plugin_activity, resolve_plugin_states, resolve_slash_contribution,
};

// ─── Plugin directory resolution ─────────────────────────────────────────────

/// Returns `~/.rhythm/plugins/`.
pub fn get_user_plugins_dir() -> PathBuf {
    paths::get_rhythm_dir().join("plugins")
}

/// Returns `<cwd>/.rhythm/plugins/`.
pub fn get_project_plugins_dir(cwd: &Path) -> PathBuf {
    cwd.join(".rhythm").join("plugins")
}

/// Returns `<cwd>/plugins/` for repo-local plugins.
pub fn get_workspace_plugins_dir(cwd: &Path) -> PathBuf {
    cwd.join("plugins")
}

// ─── Discovery ───────────────────────────────────────────────────────────────

/// Collect all plugin root directories from both user and project locations.
/// A directory qualifies if it contains a `plugin.json` file.
pub fn discover_plugin_paths(cwd: &Path) -> Vec<(PluginSource, PathBuf)> {
    let roots = [
        (PluginSource::Global, get_user_plugins_dir()),
        (PluginSource::Project, get_project_plugins_dir(cwd)),
        (PluginSource::WorkspaceDev, get_workspace_plugins_dir(cwd)),
    ];
    let mut paths: Vec<(PluginSource, PathBuf)> = Vec::new();

    for (source, root) in &roots {
        if !root.exists() {
            continue;
        }
        let mut entries: Vec<PathBuf> = std::fs::read_dir(root)
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                if p.is_dir() && p.join("plugin.json").exists() {
                    Some(p)
                } else {
                    None
                }
            })
            .collect();
        entries.sort();
        paths.extend(entries.into_iter().map(|entry| (*source, entry)));
    }

    paths
}

// ─── Single plugin load ──────────────────────────────────────────────────────

/// Attempt to load one plugin directory.
/// Returns `None` if `plugin.json` is missing or unparseable.
pub fn load_plugin(
    source: PluginSource,
    path: &Path,
    enabled_plugins: &HashMap<String, bool>,
) -> Option<LoadedPlugin> {
    let manifest_path = path.join("plugin.json");
    let manifest_text = std::fs::read_to_string(&manifest_path).ok()?;
    let manifest: PluginManifest = serde_json::from_str(&manifest_text).ok()?;

    let configured_enabled = enabled_plugins
        .get(&manifest.name)
        .copied()
        .unwrap_or(manifest.enabled_by_default);
    let granted_permissions = manifest.permissions.clone();
    let (slash_contribution, configuration_errors) = resolve_slash_contribution(path, &manifest);

    // Load skills
    let skills = load_plugin_skills(path, &manifest.skills_dir);

    // Load hooks
    let hooks = load_plugin_hooks(path, &manifest.hooks_file);

    // Load MCP servers
    let mcp_servers = load_plugin_mcp(path, &manifest.mcp_file);

    // Load agents from agents/ subdirectory
    let agents = load_plugin_agents(path);

    Some(LoadedPlugin {
        manifest,
        path: path.to_path_buf(),
        source,
        is_installed: matches!(source, PluginSource::Global),
        is_active: true,
        shadowed_by: None,
        configured_enabled,
        enabled: configured_enabled,
        status: if configured_enabled {
            PluginStatus::Enabled
        } else {
            PluginStatus::Disabled
        },
        blocked_reason: None,
        configuration_errors,
        granted_permissions,
        slash_contribution,
        skills,
        hooks,
        mcp_servers,
        agents,
    })
}

/// Load all discoverable plugins given user settings.
pub fn load_plugins(settings: &RhythmSettings, cwd: &Path) -> Vec<LoadedPlugin> {
    let mut plugins: Vec<LoadedPlugin> = discover_plugin_paths(cwd)
        .iter()
        .filter_map(|(source, path)| load_plugin(*source, path, &settings.core.plugins.enabled))
        .collect();

    resolve_plugin_activity(&mut plugins);

    for plugin in &mut plugins {
        plugin.granted_permissions = settings
            .core
            .plugins
            .permissions
            .get(&workspace_permission_key(cwd, &plugin.manifest.name))
            .or_else(|| settings.core.plugins.permissions.get(&plugin.manifest.name))
            .cloned()
            .unwrap_or_else(|| {
                if plugin.manifest.enabled_by_default {
                    plugin.manifest.permissions.clone()
                } else {
                    vec![]
                }
            });
    }

    resolve_plugin_states(&mut plugins);
    plugins
}

pub fn workspace_permission_key(cwd: &Path, plugin_name: &str) -> String {
    let workspace = cwd
        .canonicalize()
        .unwrap_or_else(|_| cwd.to_path_buf())
        .to_string_lossy()
        .replace('\\', "/");
    format!("{}::{}", workspace, plugin_name)
}

// ─── Dependency and capability resolution ────────────────────────────────────

pub(super) fn source_priority(source: PluginSource) -> u8 {
    match source {
        PluginSource::WorkspaceDev => 3,
        PluginSource::Project => 2,
        PluginSource::Global => 1,
    }
}

pub(super) fn plugin_source_label(source: PluginSource) -> &'static str {
    match source {
        PluginSource::Global => "global",
        PluginSource::Project => "project",
        PluginSource::WorkspaceDev => "workspace_dev",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::extensions::types::{
        PluginContributions, PluginDevConfig, PluginManifest, PluginProvides, PluginRequires,
    };

    fn make_plugin(name: &str, source: PluginSource, path: &str) -> LoadedPlugin {
        LoadedPlugin {
            manifest: PluginManifest {
                name: name.to_string(),
                version: "0.1.0".to_string(),
                description: String::new(),
                enabled_by_default: true,
                entry: Some("dist/main.js".to_string()),
                dev: PluginDevConfig {
                    main: Some("src/main.tsx".to_string()),
                },
                permissions: vec![],
                requires: PluginRequires::default(),
                provides: PluginProvides::default(),
                contributes: PluginContributions::default(),
                skills_dir: "skills".to_string(),
                hooks_file: "hooks.json".to_string(),
                mcp_file: "mcp.json".to_string(),
            },
            path: PathBuf::from(path),
            source,
            is_installed: matches!(source, PluginSource::Global),
            is_active: true,
            shadowed_by: None,
            configured_enabled: true,
            enabled: true,
            status: PluginStatus::Enabled,
            blocked_reason: None,
            configuration_errors: vec![],
            granted_permissions: vec![],
            slash_contribution: None,
            skills: vec![],
            hooks: HashMap::new(),
            mcp_servers: HashMap::new(),
            agents: vec![],
        }
    }

    #[test]
    fn workspace_dev_plugin_overrides_global_plugin_with_same_name() {
        let mut plugins = vec![
            make_plugin(
                "folder",
                PluginSource::Global,
                "C:/Users/test/.rhythm/plugins/folder",
            ),
            make_plugin(
                "folder",
                PluginSource::WorkspaceDev,
                "C:/repo/plugins/folder",
            ),
        ];

        resolve_plugin_activity(&mut plugins);

        assert!(!plugins[0].is_active);
        assert!(plugins[0]
            .shadowed_by
            .as_deref()
            .unwrap_or_default()
            .contains("workspace_dev"));
        assert!(plugins[1].is_active);
        assert_eq!(plugins[1].shadowed_by, None);
    }

    #[test]
    fn single_plugin_instance_remains_active() {
        let mut plugins = vec![make_plugin(
            "developer",
            PluginSource::Project,
            "C:/repo/.rhythm/plugins/developer",
        )];

        resolve_plugin_activity(&mut plugins);

        assert!(plugins[0].is_active);
        assert_eq!(plugins[0].shadowed_by, None);
    }
}
