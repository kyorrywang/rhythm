use crate::platform::event_bus;
use crate::shared::schema::EventPayload;
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

pub fn emit_tool_output(ctx: &ToolExecutionContext, log_line: impl Into<String>) {
    event_bus::emit(
        &ctx.agent_id,
        &ctx.session_id,
        EventPayload::ToolOutput {
            tool_id: ctx.tool_call_id.clone(),
            log_line: log_line.into(),
        },
    );
}

/// Resolve a user-supplied path against cwd, then verify it stays within cwd.
///
/// Returns an error string if the resolved path escapes the working directory
/// (path traversal attempt).
pub fn resolve_and_validate_path(cwd: &PathBuf, candidate: &str) -> Result<PathBuf, String> {
    let candidate_path = PathBuf::from(candidate);
    let raw = if candidate_path.is_absolute() {
        candidate_path.clone()
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
    } else if candidate_path.is_absolute() {
        normalize_path(&raw)
    } else {
        normalize_path(&canonical_cwd.join(candidate))
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
    let candidate_path = PathBuf::from(candidate);
    let raw = if candidate_path.is_absolute() {
        candidate_path.clone()
    } else {
        cwd.join(candidate)
    };

    let canonical_cwd = cwd
        .canonicalize()
        .map_err(|e| format!("Cannot resolve cwd: {}", e))?;

    let normalized = if raw.exists() {
        raw.canonicalize()
            .map_err(|e| format!("Cannot resolve path: {}", e))?
    } else if candidate_path.is_absolute() {
        normalize_path(&raw)
    } else {
        normalize_path(&canonical_cwd.join(candidate))
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

#[cfg(test)]
mod tests {
    use super::resolve_and_validate_path;
    use std::fs;

    #[test]
    fn allows_relative_path_for_new_file_inside_existing_cwd() {
        let base = std::env::temp_dir().join(format!(
            "rhythm-context-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time before unix epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&base).expect("create temp cwd");

        let resolved = resolve_and_validate_path(&base, "runs.json").expect("resolve child path");
        assert_eq!(resolved, base.join("runs.json"));

        fs::remove_dir_all(&base).expect("cleanup temp cwd");
    }
}
