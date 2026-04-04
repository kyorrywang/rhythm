use crate::core::state;

#[tauri::command]
pub async fn interrupt_session(session_id: String) -> Result<(), String> {
    state::request_interrupt(&session_id).await;
    Ok(())
}
