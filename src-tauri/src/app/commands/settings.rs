#[path = "settings_dto.rs"]
mod settings_dto;
#[path = "settings_mapping.rs"]
mod settings_mapping;

pub use settings_dto::FrontendSettings;

#[tauri::command]
pub async fn get_settings() -> Result<FrontendSettings, String> {
    Ok(settings_mapping::map_to_frontend(
        crate::platform::config::load_settings(),
    ))
}

#[tauri::command]
pub async fn save_settings(settings: FrontendSettings) -> Result<(), String> {
    crate::platform::config::save_settings(&settings_mapping::map_from_frontend(settings))
}
