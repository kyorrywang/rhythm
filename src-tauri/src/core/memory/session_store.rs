use std::path::PathBuf;
use std::fs;
use anyhow::Result;
use crate::core::models::ChatMessage;

pub struct SessionStore {
    base_dir: PathBuf,
}

impl SessionStore {
    pub fn new(workspace_path: &str) -> Self {
        let mut path = PathBuf::from(workspace_path);
        path.push(".rhythm");
        path.push("sessions");
        fs::create_dir_all(&path).ok();
        Self { base_dir: path }
    }

    fn get_path(&self, session_id: &str) -> PathBuf {
        self.base_dir.join(format!("{}.json", session_id))
    }

    pub fn load(&self, session_id: &str) -> Result<Vec<ChatMessage>> {
        let path = self.get_path(session_id);
        if !path.exists() {
            return Ok(vec![]);
        }
        let data = fs::read_to_string(path)?;
        let messages: Vec<ChatMessage> = serde_json::from_str(&data)?;
        Ok(messages)
    }

    pub fn append(&self, session_id: &str, message: ChatMessage) -> Result<()> {
        let mut history = self.load(session_id)?;
        history.push(message);
        let path = self.get_path(session_id);
        let data = serde_json::to_string_pretty(&history)?;
        fs::write(path, data)?;
        Ok(())
    }

    pub fn list_sessions(&self) -> Result<Vec<String>> {
        let mut sessions = vec![];
        if let Ok(entries) = fs::read_dir(&self.base_dir) {
            for entry in entries.flatten() {
                if let Some(stem) = entry.path().file_stem().and_then(|s| s.to_str()) {
                    sessions.push(stem.to_string());
                }
            }
        }
        sessions.sort();
        Ok(sessions)
    }

    pub fn delete_session(&self, session_id: &str) -> Result<()> {
        let path = self.get_path(session_id);
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }
}
