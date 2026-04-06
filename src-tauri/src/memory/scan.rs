use std::path::Path;
use super::paths::get_project_memory_dir;
use super::types::MemoryHeader;

/// Scan all `.md` files in the memory directory (excluding MEMORY.md).
/// Returns headers sorted by modification time descending.
pub fn scan_memory_files(cwd: &Path, max_files: usize) -> Vec<MemoryHeader> {
    let dir = get_project_memory_dir(cwd);
    let mut headers = Vec::new();

    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return headers,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|x| x != "md").unwrap_or(true) {
            continue;
        }
        if path.file_name().map(|n| n == "MEMORY.md").unwrap_or(false) {
            continue;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let modified_at = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);

        let (title, description, body_preview) = parse_memory_file(&path, &content);

        headers.push(MemoryHeader {
            path,
            title,
            description,
            modified_at,
            body_preview,
        });
    }

    headers.sort_by(|a, b| b.modified_at.partial_cmp(&a.modified_at).unwrap_or(std::cmp::Ordering::Equal));
    headers.truncate(max_files);
    headers
}

/// Parse title, description, and body preview from a memory file.
fn parse_memory_file(path: &std::path::Path, content: &str) -> (String, String, String) {
    let stem = path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut title = stem.clone();
    let mut description = String::new();
    let body_start;

    // Try YAML frontmatter
    let trimmed = content.trim_start();
    if trimmed.starts_with("---") {
        let rest = trimmed.trim_start_matches("---").trim_start_matches('\n');
        if let Some(end_off) = rest.find("\n---") {
            let fm = &rest[..end_off];
            for line in fm.lines() {
                if let Some(val) = line.strip_prefix("name:") {
                    title = val.trim().to_string();
                }
                if let Some(val) = line.strip_prefix("description:") {
                    description = val.trim().to_string();
                }
            }
            body_start = end_off + 4; // skip "\n---"
        } else {
            body_start = 0;
        }
    } else {
        body_start = 0;
    }

    let body = if body_start < content.len() {
        &content[body_start..]
    } else {
        content
    };

    // Fallback description from body text
    if description.is_empty() {
        for line in body.lines().take(10) {
            let t = line.trim();
            if !t.is_empty() && !t.starts_with('#') {
                description = t[..t.len().min(200)].to_string();
                break;
            }
        }
    }

    let body_preview_raw: String = body
        .lines()
        .filter(|l| !l.trim().starts_with('#'))
        .take(20)
        .collect::<Vec<_>>()
        .join("\n");
    let body_preview = body_preview_raw[..body_preview_raw.len().min(300)].to_string();

    (title, description, body_preview)
}
