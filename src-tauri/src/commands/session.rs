use crate::commands::workspace::resolve_workspace_path;
use crate::infrastructure::session_repository::{self, SessionSnapshot};
use crate::runtime::sessions;

#[tauri::command]
pub async fn get_sessions() -> Result<Vec<sessions::SessionInfo>, String> {
    Ok(sessions::list_sessions().await)
}

#[tauri::command]
pub async fn list_workspace_sessions(cwd: String) -> Result<Vec<SessionSnapshot>, String> {
    let cwd_path = resolve_workspace_path(Some(&cwd))?;
    session_repository::list_sessions(&cwd_path).await
}

#[tauri::command]
pub async fn get_workspace_session(
    cwd: String,
    session_id: String,
) -> Result<Option<SessionSnapshot>, String> {
    let cwd_path = resolve_workspace_path(Some(&cwd))?;
    session_repository::get_session(&cwd_path, &session_id).await
}

#[tauri::command]
pub async fn save_workspace_session(cwd: String, session: SessionSnapshot) -> Result<SessionSnapshot, String> {
    let cwd_path = resolve_workspace_path(Some(&cwd))?;
    session_repository::save_session(&cwd_path, session).await
}

#[tauri::command]
pub async fn delete_workspace_session(cwd: String, session_id: String) -> Result<bool, String> {
    let cwd_path = resolve_workspace_path(Some(&cwd))?;
    session_repository::delete_session(&cwd_path, &session_id).await
}
