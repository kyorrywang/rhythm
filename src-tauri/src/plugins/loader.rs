use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use super::types::{LoadedPlugin, PluginManifest, PluginStatus};
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

/// Returns `<cwd>/plugins/` for repo-local plugins.
pub fn get_workspace_plugins_dir(cwd: &Path) -> PathBuf {
    cwd.join("plugins")
}

// ─── Discovery ───────────────────────────────────────────────────────────────

/// Collect all plugin root directories from both user and project locations.
/// A directory qualifies if it contains a `plugin.json` file.
pub fn discover_plugin_paths(cwd: &Path) -> Vec<PathBuf> {
    let roots = [
        get_user_plugins_dir(),
        get_project_plugins_dir(cwd),
        get_workspace_plugins_dir(cwd),
    ];
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

    let configured_enabled = enabled_plugins
        .get(&manifest.name)
        .copied()
        .unwrap_or(manifest.enabled_by_default);
    let granted_permissions = manifest.permissions.clone();

    // Load skills
    let skills = load_plugin_skills(path, &manifest.skills_dir);

    // Load hooks
    let hooks = load_plugin_hooks(path, &manifest.hooks_file);

    // Load MCP servers
    let mcp_servers = load_plugin_mcp(path, &manifest.mcp_file);

    Some(LoadedPlugin {
        manifest,
        path: path.to_path_buf(),
        configured_enabled,
        enabled: configured_enabled,
        status: if configured_enabled {
            PluginStatus::Enabled
        } else {
            PluginStatus::Disabled
        },
        blocked_reason: None,
        granted_permissions,
        skills,
        hooks,
        mcp_servers,
    })
}

/// Load all discoverable plugins given user settings.
pub fn load_plugins(settings: &RhythmSettings, cwd: &Path) -> Vec<LoadedPlugin> {
    let mut plugins: Vec<LoadedPlugin> = discover_plugin_paths(cwd)
        .iter()
        .filter_map(|p| load_plugin(p, &settings.enabled_plugins))
        .collect();

    for plugin in &mut plugins {
        plugin.granted_permissions = settings
            .plugin_permissions
            .get(&workspace_permission_key(cwd, &plugin.manifest.name))
            .or_else(|| settings.plugin_permissions.get(&plugin.manifest.name))
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

fn resolve_plugin_states(plugins: &mut [LoadedPlugin]) {
    let cycle_members = detect_dependency_cycles(plugins);
    for plugin in plugins.iter_mut() {
        if !plugin.configured_enabled {
            plugin.enabled = false;
            plugin.status = PluginStatus::Disabled;
            plugin.blocked_reason = None;
        } else {
            plugin.enabled = true;
            plugin.status = PluginStatus::Enabled;
            plugin.blocked_reason = None;
        }
    }

    // Re-evaluate until transitive blocked dependencies stop changing.
    for _ in 0..=plugins.len() {
        let mut changed = false;
        let plugin_index: HashMap<String, usize> = plugins
            .iter()
            .enumerate()
            .map(|(idx, plugin)| (plugin.manifest.name.clone(), idx))
            .collect();
        let capabilities = available_capabilities(plugins);

        for idx in 0..plugins.len() {
            if !plugins[idx].configured_enabled {
                continue;
            }

            let reason = if cycle_members.contains(&plugins[idx].manifest.name) {
                Some("插件依赖存在循环".to_string())
            } else {
                blocked_reason_for(&plugins[idx], plugins, &plugin_index, &capabilities)
            };

            let next_status = if reason.is_some() {
                PluginStatus::Blocked
            } else {
                PluginStatus::Enabled
            };
            let next_enabled = next_status == PluginStatus::Enabled;
            if plugins[idx].status != next_status
                || plugins[idx].enabled != next_enabled
                || plugins[idx].blocked_reason != reason
            {
                plugins[idx].status = next_status;
                plugins[idx].enabled = next_enabled;
                plugins[idx].blocked_reason = reason;
                changed = true;
            }
        }

        if !changed {
            break;
        }
    }
}

fn blocked_reason_for(
    plugin: &LoadedPlugin,
    plugins: &[LoadedPlugin],
    plugin_index: &HashMap<String, usize>,
    capabilities: &HashSet<String>,
) -> Option<String> {
    for (dependency_name, version_range) in &plugin.manifest.requires.plugins {
        let Some(dependency_idx) = plugin_index.get(dependency_name).copied() else {
            return Some(format!("缺少依赖插件：{}", dependency_name));
        };
        let dependency = &plugins[dependency_idx];
        if !dependency.configured_enabled {
            return Some(format!("依赖插件未启用：{}", dependency_name));
        }
        if dependency.status == PluginStatus::Blocked {
            return Some(format!("依赖插件不可用：{}", dependency_name));
        }
        if !version_matches(&dependency.manifest.version, version_range) {
            return Some(format!(
                "依赖插件版本不兼容：{} {}，需要 {}",
                dependency_name, dependency.manifest.version, version_range
            ));
        }
    }

    for capability in &plugin.manifest.requires.capabilities {
        if !capabilities.contains(capability) {
            return Some(format!("缺少能力：{}", capability));
        }
    }

    let commands = available_commands(plugins);
    for command in &plugin.manifest.requires.commands {
        if !commands.contains(command) {
            return Some(format!("缺少 command：{}", command));
        }
    }

    let tools = available_tools(plugins);
    for tool in &plugin.manifest.requires.tools {
        if !tools.contains(tool) {
            return Some(format!("缺少 tool：{}", tool));
        }
    }

    None
}

fn available_capabilities(plugins: &[LoadedPlugin]) -> HashSet<String> {
    let mut capabilities: HashSet<String> = core_capabilities()
        .into_iter()
        .map(str::to_string)
        .collect();

    for plugin in plugins {
        if plugin.configured_enabled && plugin.status != PluginStatus::Blocked {
            capabilities.extend(plugin.manifest.provides.capabilities.iter().cloned());
        }
    }

    capabilities
}

fn available_commands(plugins: &[LoadedPlugin]) -> HashSet<String> {
    let mut commands: HashSet<String> = core_commands().into_iter().map(str::to_string).collect();
    for plugin in plugins {
        if plugin.configured_enabled && plugin.status != PluginStatus::Blocked {
            for command in &plugin.manifest.contributes.commands {
                if let Some(id) = command.get("id").and_then(|value| value.as_str()) {
                    commands.insert(id.to_string());
                }
            }
        }
    }
    commands
}

fn available_tools(plugins: &[LoadedPlugin]) -> HashSet<String> {
    let mut tools: HashSet<String> = core_tools().into_iter().map(str::to_string).collect();
    for plugin in plugins {
        if plugin.configured_enabled && plugin.status != PluginStatus::Blocked {
            for tool in &plugin.manifest.contributes.agent_tools {
                if let Some(id) = tool.get("id").and_then(|value| value.as_str()) {
                    tools.insert(id.to_string());
                }
            }
        }
    }
    tools
}

fn core_commands() -> Vec<&'static str> {
    vec![
        "tool.list_dir",
        "tool.read_file",
        "tool.write_file",
        "tool.edit_file",
        "tool.delete_file",
        "tool.shell",
    ]
}

fn core_tools() -> Vec<&'static str> {
    vec![
        "list_dir", "read", "write", "edit", "delete", "shell", "ask", "plan", "subagent", "skill",
    ]
}

fn core_capabilities() -> Vec<&'static str> {
    vec![
        "workspace.files.read",
        "workspace.files.write",
        "workspace.search",
        "terminal.run",
        "plugin.command.invoke",
        "scheduler.run",
        "workbench.tree",
        "workbench.text-preview",
        "workbench.markdown",
        "workbench.json",
        "workbench.table",
        "workbench.diff",
        "workbench.graph",
        "workbench.timeline",
        "workbench.form",
        "workbench.log-stream",
        "workbench.iframe",
    ]
}

fn detect_dependency_cycles(plugins: &[LoadedPlugin]) -> HashSet<String> {
    let names: HashSet<String> = plugins
        .iter()
        .map(|plugin| plugin.manifest.name.clone())
        .collect();
    let mut cyclic = HashSet::new();

    for plugin in plugins {
        let mut stack = Vec::new();
        visit_dependency_cycles(
            &plugin.manifest.name,
            plugins,
            &names,
            &mut stack,
            &mut cyclic,
        );
    }

    cyclic
}

fn visit_dependency_cycles(
    name: &str,
    plugins: &[LoadedPlugin],
    names: &HashSet<String>,
    stack: &mut Vec<String>,
    cyclic: &mut HashSet<String>,
) {
    if let Some(pos) = stack.iter().position(|item| item == name) {
        cyclic.extend(stack[pos..].iter().cloned());
        return;
    }
    if !names.contains(name) {
        return;
    }

    stack.push(name.to_string());
    if let Some(plugin) = plugins.iter().find(|plugin| plugin.manifest.name == name) {
        for dependency_name in plugin.manifest.requires.plugins.keys() {
            visit_dependency_cycles(dependency_name, plugins, names, stack, cyclic);
        }
    }
    stack.pop();
}

fn version_matches(actual: &str, range: &str) -> bool {
    let range = range.trim();
    if range.is_empty() || range == "*" {
        return true;
    }
    if let Some(required) = range.strip_prefix('^') {
        return caret_version_matches(actual, required);
    }
    actual == range
}

fn caret_version_matches(actual: &str, required: &str) -> bool {
    let Some(actual_parts) = parse_version(actual) else {
        return false;
    };
    let Some(required_parts) = parse_version(required) else {
        return false;
    };

    if actual_parts < required_parts {
        return false;
    }

    if required_parts.0 > 0 {
        actual_parts.0 == required_parts.0
    } else if required_parts.1 > 0 {
        actual_parts.0 == 0 && actual_parts.1 == required_parts.1
    } else {
        actual_parts.0 == 0 && actual_parts.1 == 0 && actual_parts.2 == required_parts.2
    }
}

fn parse_version(version: &str) -> Option<(u64, u64, u64)> {
    let clean = version
        .split_once('-')
        .map(|(base, _)| base)
        .unwrap_or(version);
    let mut parts = clean.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
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
