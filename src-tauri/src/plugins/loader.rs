use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::types::{LoadedPlugin, PluginManifest};
use crate::infrastructure::config::{HookConfig, RhythmSettings};
use crate::infrastructure::paths;
use crate::mcp::types::McpServerConfig;
use crate::skills::types::{SkillDefinition, SkillSource};

// ─── Plugin directory resolution ─────────────────────────────────────────────

/// Returns `~/.rhythm/plugins/`.
pub fn get_user_plugins_dir() -> PathBuf {
    paths::get_rhythm_dir().join("plugins")
}

/// Returns `<cwd>/.rhythm/plugins/`.
pub fn get_project_plugins_dir(cwd: &Path) -> PathBuf {
    cwd.join(".rhythm").join("plugins")
}

// ─── Discovery ───────────────────────────────────────────────────────────────

/// Collect all plugin root directories from both user and project locations.
/// A directory qualifies if it contains a `plugin.json` file.
pub fn discover_plugin_paths(cwd: &Path) -> Vec<PathBuf> {
    let roots = [get_user_plugins_dir(), get_project_plugins_dir(cwd)];
    let mut paths: Vec<PathBuf> = Vec::new();

    for root in &roots {
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
        paths.extend(entries);
    }

    paths
}

// ─── Single plugin load ──────────────────────────────────────────────────────

/// Attempt to load one plugin directory.
/// Returns `None` if `plugin.json` is missing or unparseable.
pub fn load_plugin(path: &Path, enabled_plugins: &HashMap<String, bool>) -> Option<LoadedPlugin> {
    let manifest_path = path.join("plugin.json");
    let manifest_text = std::fs::read_to_string(&manifest_path).ok()?;
    let manifest: PluginManifest = serde_json::from_str(&manifest_text).ok()?;

    let enabled = enabled_plugins
        .get(&manifest.name)
        .copied()
        .unwrap_or(manifest.enabled_by_default);

    // Load skills
    let skills = load_plugin_skills(path, &manifest.skills_dir);

    // Load hooks
    let hooks = load_plugin_hooks(path, &manifest.hooks_file);

    // Load MCP servers
    let mcp_servers = load_plugin_mcp(path, &manifest.mcp_file);

    Some(LoadedPlugin {
        manifest,
        path: path.to_path_buf(),
        enabled,
        skills,
        hooks,
        mcp_servers,
    })
}

/// Load all discoverable plugins given user settings.
pub fn load_plugins(settings: &RhythmSettings, cwd: &Path) -> Vec<LoadedPlugin> {
    discover_plugin_paths(cwd)
        .iter()
        .filter_map(|p| load_plugin(p, &settings.enabled_plugins))
        .collect()
}

// ─── Skills ──────────────────────────────────────────────────────────────────

fn load_plugin_skills(plugin_root: &Path, skills_subdir: &str) -> Vec<SkillDefinition> {
    let dir = plugin_root.join(skills_subdir);
    if !dir.exists() {
        return vec![];
    }

    // Extract plugin name from directory for attribution
    let plugin_name = plugin_root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut skills: Vec<SkillDefinition> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension().and_then(|e| e.to_str()) != Some("md") {
                return None;
            }
            let content = std::fs::read_to_string(&p).ok()?;
            let stem = p.file_stem()?.to_string_lossy().to_string();
            let (name, description) = parse_skill_markdown(&stem, &content);
            Some(SkillDefinition {
                name,
                description,
                content,
                source: SkillSource::Plugin {
                    plugin_name: plugin_name.clone(),
                },
            })
        })
        .collect();

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

/// Extract `name` and `description` from optional YAML frontmatter, falling back
/// to the file stem and first non-empty line respectively.
fn parse_skill_markdown(stem: &str, content: &str) -> (String, String) {
    if let Some(rest) = content.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let frontmatter = &rest[..end];
            let name = extract_yaml_field(frontmatter, "name").unwrap_or_else(|| stem.to_string());
            let description = extract_yaml_field(frontmatter, "description")
                .unwrap_or_else(|| first_line_after_frontmatter(content));
            return (name, description);
        }
    }
    // No frontmatter
    let description = content
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .trim_start_matches('#')
        .trim()
        .to_string();
    (stem.to_string(), description)
}

fn extract_yaml_field(frontmatter: &str, key: &str) -> Option<String> {
    frontmatter.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.starts_with(&format!("{}:", key)) {
            let value = trimmed[key.len() + 1..].trim().to_string();
            if !value.is_empty() {
                Some(value)
            } else {
                None
            }
        } else {
            None
        }
    })
}

fn first_line_after_frontmatter(content: &str) -> String {
    let mut in_front = false;
    let mut done = false;
    for line in content.lines() {
        if line.trim() == "---" {
            if !in_front {
                in_front = true;
                continue;
            } else {
                done = true;
                continue;
            }
        }
        if done && !line.trim().is_empty() {
            return line.trim_start_matches('#').trim().to_string();
        }
    }
    String::new()
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/// Parse `hooks.json` in the plugin root (flat format: map from event-name to array).
fn load_plugin_hooks(plugin_root: &Path, hooks_file: &str) -> HashMap<String, Vec<HookConfig>> {
    let path = plugin_root.join(hooks_file);
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return HashMap::new(),
    };
    serde_json::from_str(&text).unwrap_or_default()
}

// ─── MCP Servers ─────────────────────────────────────────────────────────────

/// Parse `mcp.json` in the plugin root.
/// Supports both flat `{ "name": config }` and wrapped `{ "mcpServers": { ... } }` formats.
fn load_plugin_mcp(plugin_root: &Path, mcp_file: &str) -> HashMap<String, McpServerConfig> {
    let path = plugin_root.join(mcp_file);
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return HashMap::new(),
    };

    // Try wrapped format first
    if let Ok(wrapper) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(servers) = wrapper.get("mcpServers").and_then(|v| v.as_object()) {
            let mut result = HashMap::new();
            for (k, v) in servers {
                if let Ok(cfg) = serde_json::from_value::<McpServerConfig>(v.clone()) {
                    result.insert(k.clone(), cfg);
                }
            }
            if !result.is_empty() {
                return result;
            }
        }
    }

    // Fall back to flat format
    serde_json::from_str(&text).unwrap_or_default()
}
