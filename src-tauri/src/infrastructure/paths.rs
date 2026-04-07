use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};

/// Returns the root Rhythm config directory: ~/.rhythm/
pub fn get_rhythm_dir() -> PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push(".rhythm");
    path
}

/// Returns the settings file path: ~/.rhythm/settings.json
pub fn get_settings_path() -> PathBuf {
    get_rhythm_dir().join("settings.json")
}

/// Returns the data directory: ~/.rhythm/data/
pub fn get_data_dir() -> PathBuf {
    get_rhythm_dir().join("data")
}

/// Returns the memory data directory: ~/.rhythm/data/memory/
pub fn get_memory_base_dir() -> PathBuf {
    get_data_dir().join("memory")
}

/// Returns the sessions directory: ~/.rhythm/data/sessions/
pub fn get_sessions_dir() -> PathBuf {
    get_data_dir().join("sessions")
}

/// Returns the workspace-scoped data directory:
/// ~/.rhythm/data/workspaces/<workspace_name>-<sha1_prefix>/
pub fn get_workspace_data_dir(cwd: &Path) -> PathBuf {
    let resolved = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());
    let mut hasher = Sha1::new();
    hasher.update(resolved.to_string_lossy().as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let prefix = &hash[..12];
    let workspace_name = resolved
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "root".to_string());

    let safe_name = workspace_name
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => ch,
        })
        .collect::<String>();

    get_data_dir()
        .join("workspaces")
        .join(format!("{}-{}", safe_name, prefix))
}

/// Returns the workspace-scoped sessions database path.
pub fn get_workspace_sessions_db_path(cwd: &Path) -> PathBuf {
    get_workspace_data_dir(cwd).join("sessions.db")
}

/// Returns the workspace-scoped plugin data directory.
pub fn get_workspace_plugins_data_dir(cwd: &Path) -> PathBuf {
    get_workspace_data_dir(cwd).join("plugins")
}

/// Returns a workspace-scoped data directory for a single plugin.
pub fn get_workspace_plugin_data_dir(cwd: &Path, plugin_name: &str) -> PathBuf {
    get_workspace_plugins_data_dir(cwd).join(sanitize_path_segment(plugin_name))
}

/// Returns the tasks directory: ~/.rhythm/data/tasks/
pub fn get_tasks_dir() -> PathBuf {
    get_data_dir().join("tasks")
}

/// Returns the user skills directory: ~/.rhythm/skills/
pub fn get_user_skills_dir() -> PathBuf {
    get_rhythm_dir().join("skills")
}

/// Returns the teams directory: ~/.rhythm/data/teams/
pub fn get_teams_dir() -> PathBuf {
    get_data_dir().join("teams")
}

/// Returns the plugins directory: ~/.rhythm/plugins/
pub fn get_plugins_dir() -> PathBuf {
    get_rhythm_dir().join("plugins")
}

/// Returns the cron jobs registry file: ~/.rhythm/data/cron_jobs.json
pub fn get_cron_registry_path() -> PathBuf {
    get_data_dir().join("cron_jobs.json")
}

/// Ensure a directory exists, creating it (and parents) if needed.
pub fn ensure_dir(path: &Path) -> std::io::Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

fn sanitize_path_segment(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => ch,
        })
        .collect::<String>();

    if sanitized.trim().is_empty() {
        "plugin".to_string()
    } else {
        sanitized
    }
}

/// Create all required Rhythm directories in one call.
pub fn init_rhythm_dirs() -> std::io::Result<()> {
    ensure_dir(&get_rhythm_dir())?;
    ensure_dir(&get_data_dir())?;
    ensure_dir(&get_memory_base_dir())?;
    ensure_dir(&get_sessions_dir())?;
    ensure_dir(&get_data_dir().join("workspaces"))?;
    ensure_dir(&get_tasks_dir())?;
    ensure_dir(&get_user_skills_dir())?;
    ensure_dir(&get_teams_dir())?;
    ensure_dir(&get_plugins_dir())?;
    Ok(())
}
