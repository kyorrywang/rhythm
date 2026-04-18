use std::sync::{Arc, Mutex};

use crate::app::commands;
use crate::domains::cron;
use crate::platform::config;

pub fn run() {
    let _ = config::load_settings();
    let cron_registry = Arc::new(Mutex::new(cron::CronRegistry::load()));
    commands::cron::init_registry(cron_registry.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |_app| {
            let scheduler = cron::CronScheduler::new(cron_registry.clone());
            let _handle = scheduler.start();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::chat::chat_stream,
            commands::chat::attach_session_stream,
            commands::chat::submit_user_answer,
            commands::chat::approve_permission,
            commands::llm::llm_complete,
            commands::session::get_sessions,
            commands::session::list_workspace_sessions,
            commands::session::get_workspace_session,
            commands::session::save_workspace_session,
            commands::session::delete_workspace_session,
            commands::interrupt::interrupt_session,
            commands::workspace::workspace_info,
            commands::workspace::workspace_list_dir,
            commands::workspace::workspace_read_text_file,
            commands::workspace::workspace_write_text_file,
            commands::workspace::workspace_shell_run,
            commands::memory::list_memories,
            commands::memory::add_memory,
            commands::memory::delete_memory,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::plugins::list_plugins,
            commands::slash::list_slash_commands,
            commands::plugins::enable_plugin,
            commands::plugins::disable_plugin,
            commands::plugins::grant_plugin_permission,
            commands::plugins::revoke_plugin_permission,
            commands::plugins::preview_install_plugin_cmd,
            commands::plugins::install_plugin_cmd,
            commands::plugins::uninstall_plugin_cmd,
            commands::plugins::plugin_runtime_info,
            commands::plugins::plugin_invoke_command,
            commands::plugins::plugin_start_command,
            commands::plugins::plugin_cancel_command,
            commands::plugins::plugin_storage_get,
            commands::plugins::plugin_storage_set,
            commands::plugins::plugin_storage_delete,
            commands::plugins::plugin_storage_read_text_file,
            commands::plugins::plugin_storage_write_text_file,
            commands::plugins::plugin_storage_delete_file,
            commands::plugins::plugin_storage_list_files,
            commands::swarm::list_teams,
            commands::swarm::list_team_agents,
            commands::swarm::approve_worker_permission,
            commands::swarm::list_pending_permissions,
            commands::cron::cron_list,
            commands::cron::cron_create,
            commands::cron::cron_delete,
            commands::cron::cron_toggle,
            commands::cron::cron_trigger,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
