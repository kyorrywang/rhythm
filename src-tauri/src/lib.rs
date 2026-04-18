pub mod app;
pub mod domains;
pub mod platform;
pub mod shared;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::bootstrap::run()
}
