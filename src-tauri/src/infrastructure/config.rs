use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmConfig {
    pub provider: String, // "openai" or "anthropic"
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub llm: LlmConfig,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            llm: LlmConfig {
                provider: "openai".to_string(),
                base_url: "https://api.openai.com/v1".to_string(),
                api_key: "".to_string(),
                model: "gpt-4o".to_string(),
            },
        }
    }
}

pub fn load_settings() -> Settings {
    let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push(".rhythm");
    path.push("settings.json");

    if !path.exists() {
        // Create directory if it doesn't exist
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let default_settings = Settings::default();
        let _ = fs::write(&path, serde_json::to_string_pretty(&default_settings).unwrap());
        return default_settings;
    }

    let content = fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}
