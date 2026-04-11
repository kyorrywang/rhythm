use super::environment::{format_environment_section, get_environment_info};
use super::rhythm_md::load_rhythm_md;
use crate::infrastructure::config::{ResolvedRuntimeSpec, RhythmSettings};
use std::path::Path;

const BASE_SYSTEM_PROMPT: &str = "\
You are Rhythm, an AI coding assistant built into the Rhythm IDE.
You are an interactive agent that helps users with software engineering tasks.
Use the tools available to you to assist the user effectively.
Always think step by step. When making changes to code, read the relevant files first.
Prefer targeted edits over full rewrites.
";

/// Assembles the full multi-layer system prompt for a session.
///
/// Layer structure (matches refactor_plan.md §③):
///  1. Base role prompt
///  2. Environment info (OS, Shell, Git, cwd, date)
///  3. Skills list
///  4. RHYTHM.md project instructions
///  5. Memory system [Phase 6 — injected here]
///  6. User custom system_prompt from settings
///  7. Permission / behaviour mode explanation
pub fn build_runtime_prompt(
    settings: &RhythmSettings,
    cwd: &Path,
    latest_user_prompt: Option<&str>,
    runtime_spec: &ResolvedRuntimeSpec,
) -> String {
    build_runtime_prompt_with_addition(
        settings,
        cwd,
        latest_user_prompt,
        None,
        runtime_spec,
    )
}

pub fn build_runtime_prompt_with_addition(
    settings: &RhythmSettings,
    cwd: &Path,
    latest_user_prompt: Option<&str>,
    extra_prompt: Option<&str>,
    runtime_spec: &ResolvedRuntimeSpec,
) -> String {
    let mut sections: Vec<String> = Vec::new();

    // Layer 1: Base role
    sections.push(BASE_SYSTEM_PROMPT.to_string());

    // Layer 2: Environment info
    let env = get_environment_info(cwd);
    sections.push(format_environment_section(&env));

    // Layer 3: Available Skills
    let skill_section = build_skills_section(settings, cwd);
    if !skill_section.is_empty() {
        sections.push(skill_section);
    }

    // Layer 4: RHYTHM.md project instructions
    if let Some(rhythm_md) = load_rhythm_md(cwd) {
        let truncated = rhythm_md.len() > 12000;
        let content = &rhythm_md[..rhythm_md.len().min(12000)];
        let suffix = if truncated {
            "\n\n...(content truncated)"
        } else {
            ""
        };
        sections.push(format!(
            "# Project Instructions (RHYTHM.md)\n\n{}{}",
            content, suffix
        ));
    }

    // Layer 5: Memory [Phase 6 — disabled until memory module is ready]
    if settings.core.memory.enabled {
        if let Some(mem_section) =
            crate::memory::memdir::load_memory_prompt(cwd, settings.core.memory.max_entrypoint_lines)
        {
            sections.push(mem_section);

            // Relevant memories based on the latest user prompt
            if let Some(query) = latest_user_prompt {
                let relevant = crate::memory::search::find_relevant_memories(
                    query,
                    cwd,
                    settings.core.memory.max_files,
                );
                if !relevant.is_empty() {
                    let mut lines = vec!["# Relevant Memories".to_string()];
                    for header in relevant {
                        if let Ok(content) = std::fs::read_to_string(&header.path) {
                            let trimmed = content.trim();
                            let truncated = trimmed.len() > 8000;
                            let body = &trimmed[..trimmed.len().min(8000)];
                            let suffix = if truncated {
                                "\n...(content truncated)"
                            } else {
                                ""
                            };
                            lines.push(format!(
                                "\n## {}\n```md\n{}{}```",
                                header
                                    .path
                                    .file_name()
                                    .unwrap_or_default()
                                    .to_string_lossy(),
                                body,
                                suffix
                            ));
                        }
                    }
                    sections.push(lines.join("\n"));
                }
            }
        }
    }

    // Layer 6: User custom prompt
    if let Some(custom) = &settings.prompts.system_prompt {
        sections.push(format!("# User Custom Instructions\n\n{}", custom));
    }

    let profile_prompt = runtime_spec
        .prompt_refs
        .iter()
        .filter_map(|prompt_ref| settings.prompts.fragments.get(prompt_ref))
        .filter(|fragment| !fragment.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>();
    if !profile_prompt.is_empty() {
        sections.push(profile_prompt.join("\n\n"));
    }

    // Optional additive prompt for subagents / worker roles
    if let Some(extra) = extra_prompt {
        if !extra.trim().is_empty() {
            sections.push(format!("# Additional Agent Instructions\n\n{}", extra));
        }
    }

    // Layer 7: Permission mode explanation
    let perm_note = match runtime_spec.permission.mode {
        crate::permissions::modes::PermissionMode::Plan => "# Behaviour Mode\nYou are in PLAN mode. You may only read files and analyse code — all write/execute operations are blocked.",
        crate::permissions::modes::PermissionMode::FullAuto => "# Behaviour Mode\nYou are in FULL AUTO mode. All operations are permitted without user confirmation.",
        crate::permissions::modes::PermissionMode::Default => "# Behaviour Mode\nDefault mode: read operations are always allowed; write/execute operations will request user confirmation.",
    };
    sections.push(perm_note.to_string());

    sections
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn build_skills_section(settings: &RhythmSettings, cwd: &Path) -> String {
    let registry = crate::skills::loader::load_skill_registry_for_cwd(&settings, &cwd);
    build_skills_section_from_registry(&registry)
}

fn build_skills_section_from_registry(registry: &crate::skills::SkillRegistry) -> String {
    let skills = registry.list_skills();
    if skills.is_empty() {
        return String::new();
    }
    let mut lines = vec![
        "# Available Skills".to_string(),
        "Use the `skill` tool to load detailed instructions for any of these skills:".to_string(),
        String::new(),
    ];
    for s in skills {
        lines.push(format!("- **{}**: {}", s.name, s.description));
    }
    lines.join("\n")
}
