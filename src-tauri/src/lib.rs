pub mod shared;
pub mod infrastructure;
pub mod commands;
pub mod models;
pub mod runtime;

// ── New top-level modules (refactored architecture) ──────────────────────────
pub mod tools;
pub mod permissions;
pub mod engine;
pub mod prompts;
pub mod skills;
pub mod memory;
pub mod hooks;
pub mod mcp;

// ── Advanced modules (Phase 9-12) ────────────────────────────────────────────
pub mod plugins;
pub mod coordinator;
pub mod swarm;
pub mod cron;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::sync::{Arc, Mutex};

    // Ensure settings are loaded and folder/file is created at startup
    let _ = infrastructure::config::load_settings();

    // Initialize cron scheduler
    let cron_registry = Arc::new(Mutex::new(cron::CronRegistry::load()));
    let scheduler = cron::CronScheduler::new(cron_registry.clone());
    let _handle = scheduler.start();

    // Store registry in commands module's static for command access
    commands::cron::init_registry(cron_registry);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Core chat/session commands
            commands::chat::chat_stream,
            commands::chat::submit_user_answer,
            commands::chat::approve_permission,
            commands::session::get_sessions,
            commands::interrupt::interrupt_session,
            // Memory management
            commands::memory::list_memories,
            commands::memory::add_memory,
            commands::memory::delete_memory,
            // Plugin management (Phase 10)
            commands::plugins::list_plugins,
            commands::plugins::enable_plugin,
            commands::plugins::disable_plugin,
            commands::plugins::install_plugin_cmd,
            commands::plugins::uninstall_plugin_cmd,
            // Swarm / multi-agent (Phase 12)
            commands::swarm::list_teams,
            commands::swarm::list_team_agents,
            commands::swarm::approve_worker_permission,
            commands::swarm::list_pending_permissions,
            // Cron task scheduling (Phase 11)
            commands::cron::cron_list,
            commands::cron::cron_create,
            commands::cron::cron_delete,
            commands::cron::cron_toggle,
            commands::cron::cron_trigger,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
