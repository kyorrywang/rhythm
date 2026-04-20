pub mod app;
pub mod infra;
pub mod runtime;
pub mod shared;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::bootstrap::run()
}
