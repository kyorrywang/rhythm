use std::path::Path;
use super::paths::get_project_memory_dir;
use super::paths::get_memory_entrypoint;

/// Add a new memory entry (creates the file and updates MEMORY.md index).
pub fn add_memory_entry(cwd: &Path, title: &str, content: &str) -> std::io::Result<std::path::PathBuf> {
    let dir = get_project_memory_dir(cwd);
    let slug = slugify(title);
    let file_path = dir.join(format!("{}.md", slug));

    std::fs::write(&file_path, content)?;

    // Update MEMORY.md index
    let index_path = get_memory_entrypoint(cwd);
    let existing = if index_path.exists() {
        std::fs::read_to_string(&index_path).unwrap_or_default()
    } else {
        "# Memory Index\n".to_string()
    };

    let link = format!("- [{}]({}.md)\n", title, slug);
    if !existing.contains(&link) {
        let updated = format!("{}{}", existing, link);
        std::fs::write(&index_path, updated)?;
    }

    Ok(file_path)
}

/// Remove a memory entry by file stem (with or without .md extension).
pub fn remove_memory_entry(cwd: &Path, name: &str) -> bool {
    let dir = get_project_memory_dir(cwd);
    let stem = name.trim_end_matches(".md");
    let file_path = dir.join(format!("{}.md", stem));

    if !file_path.exists() {
        return false;
    }

    let _ = std::fs::remove_file(&file_path);

    // Remove from MEMORY.md index
    let index_path = get_memory_entrypoint(cwd);
    if index_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&index_path) {
            let filtered: String = content
                .lines()
                .filter(|l| !l.contains(&format!("{}.md", stem)))
                .map(|l| format!("{}\n", l))
                .collect();
            let _ = std::fs::write(&index_path, filtered);
        }
    }

    true
}

fn slugify(title: &str) -> String {
    title
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_lowercase().next().unwrap() } else { '_' })
        .collect()
}
