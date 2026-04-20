pub use crate::app::settings::FrontendSettings;

#[tauri::command]
pub async fn get_settings() -> Result<FrontendSettings, String> {
    Ok(crate::app::settings::mapping::map_to_frontend(
        crate::infra::config::load_settings(),
    ))
}

#[tauri::command]
pub async fn save_settings(settings: FrontendSettings) -> Result<(), String> {
    crate::infra::config::save_settings(&crate::app::settings::mapping::map_from_frontend(settings))
}
