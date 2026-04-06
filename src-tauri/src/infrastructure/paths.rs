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

/// Create all required Rhythm directories in one call.
pub fn init_rhythm_dirs() -> std::io::Result<()> {
    ensure_dir(&get_rhythm_dir())?;
    ensure_dir(&get_data_dir())?;
    ensure_dir(&get_memory_base_dir())?;
    ensure_dir(&get_sessions_dir())?;
    ensure_dir(&get_tasks_dir())?;
    ensure_dir(&get_user_skills_dir())?;
    ensure_dir(&get_teams_dir())?;
    ensure_dir(&get_plugins_dir())?;
    Ok(())
}
