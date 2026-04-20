use crate::runtime::conversation::session::repository::SessionSnapshot;

#[tauri::command]
pub async fn get_sessions(
) -> Result<Vec<crate::runtime::conversation::session::sessions::SessionInfo>, String> {
    Ok(crate::runtime::conversation::session::sessions::list_sessions().await)
}

#[tauri::command]
pub async fn list_workspace_sessions(cwd: String) -> Result<Vec<SessionSnapshot>, String> {
    let cwd_path =
        crate::runtime::context::workspace::application::resolve_workspace_path(Some(&cwd))?;
    crate::runtime::conversation::session::repository::list_sessions(&cwd_path).await
}

#[tauri::command]
pub async fn get_workspace_session(
    cwd: String,
    session_id: String,
) -> Result<Option<SessionSnapshot>, String> {
    let cwd_path =
        crate::runtime::context::workspace::application::resolve_workspace_path(Some(&cwd))?;
    crate::runtime::conversation::session::repository::get_session(&cwd_path, &session_id).await
}

#[tauri::command]
pub async fn save_workspace_session(
    cwd: String,
    session: SessionSnapshot,
) -> Result<SessionSnapshot, String> {
    let cwd_path =
        crate::runtime::context::workspace::application::resolve_workspace_path(Some(&cwd))?;
    crate::runtime::conversation::session::repository::save_session(&cwd_path, session).await
}

#[tauri::command]
pub async fn delete_workspace_session(cwd: String, session_id: String) -> Result<bool, String> {
    let cwd_path =
        crate::runtime::context::workspace::application::resolve_workspace_path(Some(&cwd))?;
    crate::runtime::conversation::session::repository::delete_session(&cwd_path, &session_id).await
}
