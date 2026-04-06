use std::path::Path;

/// Walk upward from `cwd` looking for a RHYTHM.md file.
/// Returns the first one found, or None.
pub fn load_rhythm_md(cwd: &Path) -> Option<String> {
    let mut current = cwd.to_path_buf();
    loop {
        let candidate = current.join("RHYTHM.md");
        if candidate.exists() {
            if let Ok(content) = std::fs::read_to_string(&candidate) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        // Also check .rhythm/RHYTHM.md
        let dot_candidate = current.join(".rhythm").join("RHYTHM.md");
        if dot_candidate.exists() {
            if let Ok(content) = std::fs::read_to_string(&dot_candidate) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        if !current.pop() {
            break;
        }
    }
    None
}
