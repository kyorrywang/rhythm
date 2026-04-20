use super::registry::SkillRegistry;
use super::types::{SkillDefinition, SkillSource};
use crate::infra::config::RhythmSettings;
use crate::infra::paths::get_user_skills_dir;
use crate::shared::text::truncate_chars;
use std::path::Path;

// ─── Bundled skills (embedded at compile time) ────────────────────────────────

fn get_bundled_skills() -> Vec<SkillDefinition> {
    vec![]
}

/// Parse a skill from its Markdown content.
/// The first `# Heading` line is the name fallback; the first non-empty non-heading
/// paragraph is the description.
fn parse_skill(default_name: &str, content: &str, source: SkillSource) -> SkillDefinition {
    let mut name = default_name.to_string();
    let mut description = String::new();

    // Check for YAML frontmatter  ---\nname: ...\ndescription: ...\n---
    if content.trim_start().starts_with("---") {
        let rest = content.trim_start().trim_start_matches("---").trim_start();
        if let Some(end) = rest.find("\n---") {
            let fm = &rest[..end];
            for line in fm.lines() {
                if let Some(val) = line.strip_prefix("name:") {
                    name = val.trim().to_string();
                }
                if let Some(val) = line.strip_prefix("description:") {
                    description = val.trim().to_string();
                }
            }
        }
    }

    // Fallback: parse first heading + first paragraph
    if description.is_empty() {
        let mut found_heading = false;
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('#') {
                if !found_heading {
                    found_heading = true;
                    name = trimmed.trim_start_matches('#').trim().to_string();
                }
            } else if found_heading && !trimmed.is_empty() && description.is_empty() {
                description = truncate_chars(trimmed, 200).to_string();
            }
        }
    }

    SkillDefinition {
        name,
        description,
        content: content.to_string(),
        source,
    }
}

// ─── User skills (loaded from ~/.rhythm/skills/*.md) ─────────────────────────

fn load_user_skills() -> Vec<SkillDefinition> {
    let skills_dir = get_user_skills_dir();
    if !skills_dir.exists() {
        return vec![];
    }

    let mut skills = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&skills_dir) {
        let mut paths: Vec<_> = entries
            .flatten()
            .filter(|e| e.path().extension().map(|x| x == "md").unwrap_or(false))
            .collect();
        paths.sort_by_key(|e| e.path());

        for entry in paths {
            let path = entry.path();
            let default_name = path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            if let Ok(content) = std::fs::read_to_string(&path) {
                skills.push(parse_skill(&default_name, &content, SkillSource::User));
            }
        }
    }
    skills
}

// ─── Public entry point ────────────────────────────────────────────────────────

pub fn load_skill_registry_for_cwd(settings: &RhythmSettings, cwd: &Path) -> SkillRegistry {
    let mut registry = SkillRegistry::new();
    for skill in get_bundled_skills() {
        registry.register(skill);
    }
    for skill in load_user_skills() {
        registry.register(skill); // user skills override bundled with same name
    }
    for plugin in crate::runtime::extensions::loader::load_plugins(settings, cwd) {
        if plugin.is_runtime_active() {
            for skill in plugin.skills {
                registry.register(skill); // enabled plugins override previous skills with same name
            }
        }
    }
    registry
}

pub fn load_skill_registry() -> SkillRegistry {
    let settings = crate::infra::config::load_settings();
    let cwd = std::env::current_dir().unwrap_or_else(|_| ".".into());
    load_skill_registry_for_cwd(&settings, &cwd)
}
