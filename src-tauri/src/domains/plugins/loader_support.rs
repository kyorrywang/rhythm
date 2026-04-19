use super::{plugin_source_label, source_priority};
use crate::domains::agents::AgentDefinition;
use crate::domains::plugins::types::{
    LoadedPlugin, PluginManifest, PluginSlashContribution, PluginStatus,
};
use crate::platform::config::HookConfig;
use crate::platform::mcp::types::McpServerConfig;
use crate::platform::skills::types::{SkillDefinition, SkillSource};
use std::collections::{HashMap, HashSet};
use std::path::Path;

pub(super) fn resolve_plugin_states(plugins: &mut [LoadedPlugin]) {
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

    for _ in 0..=plugins.len() {
        let mut changed = false;
        let plugin_index: HashMap<String, usize> = plugins
            .iter()
            .enumerate()
            .filter_map(|(idx, plugin)| {
                if plugin.is_active {
                    Some((plugin.manifest.name.clone(), idx))
                } else {
                    None
                }
            })
            .collect();
        let capabilities = available_capabilities(plugins);

        for idx in 0..plugins.len() {
            if !plugins[idx].configured_enabled || !plugins[idx].is_active {
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
    if let Some(error) = plugin.configuration_errors.first() {
        return Some(error.clone());
    }

    for (dependency_name, version_range) in &plugin.manifest.requires.plugins {
        let Some(dependency_idx) = plugin_index.get(dependency_name).copied() else {
            return Some(format!("缺少依赖插件：{}", dependency_name));
        };
        let dependency = &plugins[dependency_idx];
        if !dependency.configured_enabled || !dependency.is_active {
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
        if plugin.is_runtime_active() {
            capabilities.extend(plugin.manifest.provides.capabilities.iter().cloned());
        }
    }

    capabilities
}

fn available_commands(plugins: &[LoadedPlugin]) -> HashSet<String> {
    let mut commands: HashSet<String> = core_commands().into_iter().map(str::to_string).collect();
    for plugin in plugins {
        if plugin.is_runtime_active() {
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
        if plugin.is_runtime_active() {
            for tool in &plugin.manifest.contributes.agent_tools {
                if let Some(id) = tool.get("id").and_then(|value| value.as_str()) {
                    tools.insert(id.to_string());
                }
            }
        }
    }
    tools
}

pub(super) fn resolve_plugin_activity(plugins: &mut [LoadedPlugin]) {
    let mut winners: HashMap<String, usize> = HashMap::new();

    for idx in 0..plugins.len() {
        let plugin_name = plugins[idx].manifest.name.clone();
        match winners.get(&plugin_name).copied() {
            Some(current_idx)
                if source_priority(plugins[idx].source)
                    > source_priority(plugins[current_idx].source) =>
            {
                winners.insert(plugin_name, idx);
            }
            None => {
                winners.insert(plugin_name, idx);
            }
            _ => {}
        }
    }

    for idx in 0..plugins.len() {
        let plugin_name = plugins[idx].manifest.name.clone();
        let winner_idx = winners.get(&plugin_name).copied();
        let is_winner = winner_idx == Some(idx);
        plugins[idx].is_active = is_winner;
        plugins[idx].shadowed_by = if is_winner {
            None
        } else {
            winner_idx.map(|winner| {
                format!(
                    "{}:{}",
                    plugin_source_label(plugins[winner].source),
                    plugins[winner].path.to_string_lossy()
                )
            })
        };
    }
}

fn core_commands() -> Vec<&'static str> {
    vec![
        "tool.list_dir",
        "tool.read_file",
        "tool.write_file",
        "tool.edit_file",
        "tool.delete_file",
        "tool.shell",
        "core.llm.complete",
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

pub(super) fn resolve_slash_contribution(
    plugin_root: &Path,
    manifest: &PluginManifest,
) -> (Option<PluginSlashContribution>, Vec<String>) {
    let Some(raw) = manifest.contributes.slash.as_ref() else {
        return (None, Vec::new());
    };

    let parsed = match serde_json::from_value::<PluginSlashContribution>(raw.clone()) {
        Ok(parsed) => parsed,
        Err(error) => {
            return (
                None,
                vec![format!(
                    "插件 '{}' 的 contributes.slash 配置无效: {}",
                    manifest.name, error
                )],
            )
        }
    };

    let mut errors = Vec::new();
    validate_slash_path(
        plugin_root,
        &manifest.name,
        "commandsDir",
        &parsed.commands_dir,
        true,
        &mut errors,
    );
    validate_slash_path(
        plugin_root,
        &manifest.name,
        "skillsDir",
        &parsed.skills_dir,
        true,
        &mut errors,
    );
    validate_slash_path(
        plugin_root,
        &manifest.name,
        "runtimeEntry",
        &parsed.runtime_entry,
        false,
        &mut errors,
    );

    if errors.is_empty() {
        (Some(parsed), errors)
    } else {
        (None, errors)
    }
}

fn validate_slash_path(
    plugin_root: &Path,
    plugin_name: &str,
    field_name: &str,
    relative: &str,
    expect_directory: bool,
    errors: &mut Vec<String>,
) {
    let trimmed = relative.trim();
    if trimmed.is_empty() {
        errors.push(format!(
            "插件 '{}' 的 contributes.slash.{} 不能为空",
            plugin_name, field_name
        ));
        return;
    }

    let resolved = plugin_root.join(trimmed);
    if !resolved.exists() {
        errors.push(format!(
            "插件 '{}' 的 contributes.slash.{} 指向不存在的路径 '{}'",
            plugin_name,
            field_name,
            resolved.display()
        ));
        return;
    }

    if expect_directory && !resolved.is_dir() {
        errors.push(format!(
            "插件 '{}' 的 contributes.slash.{} 必须是目录: '{}'",
            plugin_name,
            field_name,
            resolved.display()
        ));
    }

    if !expect_directory && !resolved.is_file() {
        errors.push(format!(
            "插件 '{}' 的 contributes.slash.{} 必须是文件: '{}'",
            plugin_name,
            field_name,
            resolved.display()
        ));
    }
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

pub(super) fn load_plugin_skills(plugin_root: &Path, skills_subdir: &str) -> Vec<SkillDefinition> {
    let dir = plugin_root.join(skills_subdir);
    if !dir.exists() {
        return vec![];
    }

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

pub(super) fn load_plugin_hooks(
    plugin_root: &Path,
    hooks_file: &str,
) -> HashMap<String, Vec<HookConfig>> {
    let path = plugin_root.join(hooks_file);
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return HashMap::new(),
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub(super) fn load_plugin_mcp(
    plugin_root: &Path,
    mcp_file: &str,
) -> HashMap<String, McpServerConfig> {
    let path = plugin_root.join(mcp_file);
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return HashMap::new(),
    };

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

    serde_json::from_str(&text).unwrap_or_default()
}

pub(super) fn load_plugin_agents(plugin_root: &Path) -> Vec<AgentDefinition> {
    let agents_dir = plugin_root.join("agents");
    if !agents_dir.exists() {
        return Vec::new();
    }

    let mut agents = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&agents_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("yaml") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    match serde_yaml::from_str::<AgentDefinition>(&content) {
                        Ok(agent) => agents.push(agent),
                        Err(e) => eprintln!(
                            "[plugins] Failed to parse agent YAML '{}': {}",
                            path.display(),
                            e
                        ),
                    }
                }
            }
        }
    }
    agents.sort_by(|a, b| a.id().cmp(b.id()));
    agents
}
