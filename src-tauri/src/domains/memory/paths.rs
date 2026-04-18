use crate::platform::paths::get_memory_base_dir;
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};

/// Returns the project-specific memory directory.
/// Path: `~/.rhythm/data/memory/<project_name>-<sha1_prefix>/`
pub fn get_project_memory_dir(cwd: &Path) -> PathBuf {
    let resolved = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());
    let mut hasher = Sha1::new();
    hasher.update(resolved.to_string_lossy().as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let prefix = &hash[..12];
    let project_name = resolved
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "root".to_string());

    let dir = get_memory_base_dir().join(format!("{}-{}", project_name, prefix));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Returns the path to the MEMORY.md index file for a project.
pub fn get_memory_entrypoint(cwd: &Path) -> PathBuf {
    get_project_memory_dir(cwd).join("MEMORY.md")
}
