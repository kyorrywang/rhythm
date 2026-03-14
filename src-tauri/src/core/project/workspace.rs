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
            let default_settings = json!({
                "llm_api_key": "",
                "llm_model": "gpt-4o",
                "llm_base_url": "https://api.openai.com/v1"
            });
            fs::write(settings_path, serde_json::to_string_pretty(&default_settings)?)?;
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
