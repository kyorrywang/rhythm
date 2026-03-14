// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod core;
use tauri::Manager;
use core::orchestration::state::CoreState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(CoreState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::init_workspace,
            commands::list_sessions,
            commands::delete_session,
            commands::get_session_history,
            commands::list_workspace_tree,
            commands::read_text_file,
            commands::list_workflow_templates,
            commands::list_workflow_instances,
            commands::get_global_config,
            commands::get_effective_config,
            commands::save_global_config,
            commands::get_workspace_config,
            commands::save_workspace_config,
            commands::start_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
