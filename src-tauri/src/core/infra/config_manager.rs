use std::path::PathBuf;
use std::fs;
use anyhow::Result;
use serde_json::{Value, json};

pub struct ConfigManager {
    global_dir: PathBuf,
}

impl ConfigManager {
    pub fn new() -> Self {
        let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push(".rhythm");
        fs::create_dir_all(&path).ok();
        Self { global_dir: path }
    }

    fn global_path(&self) -> PathBuf {
        self.global_dir.join("settings.json")
    }

    fn workspace_path(&self, workspace_path: &str) -> PathBuf {
        let mut path = PathBuf::from(workspace_path);
        path.push(".rhythm");
        path.push("settings.json");
        path
    }

    fn load_json(&self, path: PathBuf) -> Value {
        if path.exists() {
            if let Ok(data) = fs::read_to_string(path) {
                if let Ok(v) = serde_json::from_str(&data) {
                    return v;
                }
            }
        }
        json!({})
    }

    pub fn get_global_config(&self) -> Value {
        let mut config = self.load_json(self.global_path());
        if config.as_object().map_or(true, |o| o.is_empty()) {
            config = json!({
                "llm": {
                    "provider": "openai",
                    "url": "https://api.openai.com/v1",
                    "key": "",
                    "model": "gpt-4o-mini"
                }
            });
        }
        config
    }

    pub fn get_workspace_config(&self, workspace_path: &str) -> Value {
        self.load_json(self.workspace_path(workspace_path))
    }

    pub fn save_global_config(&self, config: Value) -> Result<()> {
        let data = serde_json::to_string_pretty(&config)?;
        fs::write(self.global_path(), data)?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn save_workspace_config(&self, workspace_path: &str, config: Value) -> Result<()> {
        let path = self.workspace_path(workspace_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }
        let data = serde_json::to_string_pretty(&config)?;
        fs::write(path, data)?;
        Ok(())
    }

    pub fn get_effective_config(&self, workspace_path: Option<&str>) -> Value {
        let mut config = self.get_global_config();
        if let Some(wp) = workspace_path {
            let ws_config = self.get_workspace_config(wp);
            if let Some(obj) = config.as_object_mut() {
                if let Some(ws_obj) = ws_config.as_object() {
                    for (k, v) in ws_obj {
                        obj.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        config
    }
}
