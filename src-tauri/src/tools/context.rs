use serde_json::Value;
use std::collections::HashMap;
use std::path::Component;
use std::path::PathBuf;

/// Execution context passed to every tool — replaces the old loose parameters.
pub struct ToolExecutionContext {
    /// Current working directory for file-relative operations.
    pub cwd: PathBuf,
    /// Agent ID (needed for event_bus::emit).
    pub agent_id: String,
    /// Session ID (needed for event_bus::emit and state).
    pub session_id: String,
    /// Current tool invocation ID (used in ToolOutput events).
    pub tool_call_id: String,
    /// Extra metadata (can carry skill_registry, mcp_manager, etc. later).
    pub metadata: HashMap<String, Value>,
}

/// Resolve a user-supplied path against cwd, then verify it stays within cwd.
///
/// Returns an error string if the resolved path escapes the working directory
/// (path traversal attempt).
pub fn resolve_and_validate_path(cwd: &PathBuf, candidate: &str) -> Result<PathBuf, String> {
    let raw = if PathBuf::from(candidate).is_absolute() {
        PathBuf::from(candidate)
    } else {
        cwd.join(candidate)
    };

    // Canonicalize cwd for comparison
    let canonical_cwd = cwd
        .canonicalize()
        .map_err(|e| format!("Cannot resolve cwd: {}", e))?;

    // Canonicalize the target when possible.
    let canonical_target = if raw.exists() {
        raw.canonicalize()
            .map_err(|e| format!("Cannot resolve path: {}", e))?
    } else {
        normalize_path(&raw)
    };

    if !canonical_target.starts_with(&canonical_cwd) {
        return Err(format!(
            "Path '{}' is outside the working directory",
            candidate
        ));
    }

    Ok(raw)
}

pub fn resolve_permission_path(cwd: &PathBuf, candidate: &str) -> Result<String, String> {
    let raw = if PathBuf::from(candidate).is_absolute() {
        PathBuf::from(candidate)
    } else {
        cwd.join(candidate)
    };

    let canonical_cwd = cwd
        .canonicalize()
        .map_err(|e| format!("Cannot resolve cwd: {}", e))?;

    let normalized = if raw.exists() {
        raw.canonicalize()
            .map_err(|e| format!("Cannot resolve path: {}", e))?
    } else {
        normalize_path(&raw)
    };

    if !normalized.starts_with(&canonical_cwd) {
        return Err(format!(
            "Path '{}' is outside the working directory",
            candidate
        ));
    }

    Ok(normalized.to_string_lossy().replace('\\', "/"))
}

fn normalize_path(path: &PathBuf) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }

    normalized
}
