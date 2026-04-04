#[tauri::command]
pub async fn get_sessions() -> Result<Vec<String>, String> {
    // Stub implementation
    Ok(vec!["sess-1".to_string()])
}
