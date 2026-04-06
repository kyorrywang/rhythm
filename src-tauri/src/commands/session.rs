use crate::runtime::sessions;

#[tauri::command]
pub async fn get_sessions() -> Result<Vec<sessions::SessionInfo>, String> {
    Ok(sessions::list_sessions().await)
}
