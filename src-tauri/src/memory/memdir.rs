use std::path::Path;
use super::paths::{get_project_memory_dir, get_memory_entrypoint};

/// Build the # Memory section for injecting into the system prompt.
pub fn load_memory_prompt(cwd: &Path, max_entrypoint_lines: usize) -> Option<String> {
    let memory_dir = get_project_memory_dir(cwd);
    let entrypoint = get_memory_entrypoint(cwd);

    let mut lines = vec![
        "# Memory".to_string(),
        format!("- Persistent memory directory: {}", memory_dir.display()),
        "- Use this directory to store durable project context that should survive future sessions.".to_string(),
        "- Prefer concise topic files plus an index entry in MEMORY.md.".to_string(),
    ];

    if entrypoint.exists() {
        if let Ok(content) = std::fs::read_to_string(&entrypoint) {
            let preview_lines: Vec<&str> = content.lines().take(max_entrypoint_lines).collect();
            if !preview_lines.is_empty() {
                lines.push(String::new());
                lines.push("## MEMORY.md".to_string());
                lines.push("```md".to_string());
                lines.extend(preview_lines.iter().map(|l| l.to_string()));
                lines.push("```".to_string());
            }
        }
    } else {
        lines.push(String::new());
        lines.push("## MEMORY.md".to_string());
        lines.push("(not created yet)".to_string());
    }

    Some(lines.join("\n"))
}
