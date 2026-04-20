#[tauri::command]
pub async fn interrupt_session(session_id: String) -> Result<(), String> {
    crate::runtime::conversation::interrupts::request_interrupt(&session_id).await;

    for child_session in
        crate::runtime::conversation::session::session_tree::get_all_descendant_sessions(
            &session_id,
        )
        .await
    {
        crate::runtime::conversation::interrupts::request_interrupt(&child_session).await;
    }

    crate::runtime::conversation::session::session_tree::unregister_session_tree(&session_id).await;

    Ok(())
}
