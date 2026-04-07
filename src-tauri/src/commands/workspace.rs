use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, serde::Serialize)]
pub struct WorkspaceInfo {
    pub name: String,
    pub path: String,
    pub is_git_repo: bool,
}

#[tauri::command]
pub async fn workspace_info(path: String) -> Result<WorkspaceInfo, String> {
    let resolved = resolve_workspace_path(Some(path.trim()))?;
    Ok(WorkspaceInfo {
        name: workspace_name(&resolved),
        path: resolved.to_string_lossy().to_string(),
        is_git_repo: is_git_repo(&resolved),
    })
}

pub fn resolve_workspace_path(path: Option<&str>) -> Result<PathBuf, String> {
    let raw = match path.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => PathBuf::from(value),
        None => std::env::current_dir().map_err(|e| format!("Cannot read current dir: {e}"))?,
    };

    let canonical = raw
        .canonicalize()
        .map_err(|e| format!("Cannot resolve workspace '{}': {e}", raw.display()))?;

    if !canonical.is_dir() {
        return Err(format!(
            "Workspace '{}' is not a directory",
            canonical.display()
        ));
    }

    Ok(canonical)
}

fn workspace_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.display().to_string())
}

fn is_git_repo(path: &Path) -> bool {
    Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(path)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}
