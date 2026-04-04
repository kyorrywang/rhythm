pub mod shared;
pub mod infrastructure;
pub mod core;
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ensure settings are loaded and folder/file is created at startup
    let _ = infrastructure::config::load_settings();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::chat::chat_stream,
            commands::session::get_sessions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
