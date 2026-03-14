use std::path::PathBuf;
use std::fs;
use anyhow::Result;
use serde_json::json;

pub struct WorkspaceManager;

impl WorkspaceManager {
    pub fn new() -> Self {
        Self
    }

    pub fn init_workspace(&self, workspace_path: &str) -> Result<()> {
        let base = PathBuf::from(workspace_path);
        fs::create_dir_all(&base)?;

        let rhythm_dir = base.join(".rhythm");
        fs::create_dir_all(&rhythm_dir)?;

        let settings_path = rhythm_dir.join("settings.json");
        if !settings_path.exists() {
            fs::write(settings_path, json!({}).to_string())?;
        }

        fs::create_dir_all(rhythm_dir.join("sessions"))?;
        fs::create_dir_all(rhythm_dir.join("flow_instances"))?;
        fs::create_dir_all(rhythm_dir.join("artifacts"))?;

        fs::create_dir_all(base.join("workflows"))?;

        let rhythm_md = base.join(".RHYTHM.md");
        if !rhythm_md.exists() {
            fs::write(rhythm_md, "# Rhythm Project Context\n\nAdd global instructions or context for this project here.\n")?;
        }

        Ok(())
    }
}
