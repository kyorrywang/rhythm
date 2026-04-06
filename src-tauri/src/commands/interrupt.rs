use crate::runtime::{interrupts, session_tree};

#[tauri::command]
pub async fn interrupt_session(session_id: String) -> Result<(), String> {
    interrupts::request_interrupt(&session_id).await;

    for child_session in session_tree::get_all_descendant_sessions(&session_id).await {
        interrupts::request_interrupt(&child_session).await;
    }

    session_tree::unregister_session_tree(&session_id).await;

    Ok(())
}
