use crate::core::state;

#[tauri::command]
pub async fn interrupt_session(session_id: String) -> Result<(), String> {
    state::request_interrupt(&session_id).await;

    for child_session in state::get_all_descendant_sessions(&session_id).await {
        state::request_interrupt(&child_session).await;
    }

    state::unregister_session_tree(&session_id).await;

    Ok(())
}
