use crate::domains::memory;
use std::path::PathBuf;

#[tauri::command]
pub async fn list_memories(cwd: String) -> Result<Vec<String>, String> {
    let cwd_path = PathBuf::from(&cwd);
    let entries = memory::scan_memory_files(&cwd_path, 100);
    let names: Vec<String> = entries
        .iter()
        .filter_map(|h| h.path.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .collect();
    Ok(names)
}

#[tauri::command]
pub async fn add_memory(cwd: String, title: String, content: String) -> Result<String, String> {
    let cwd_path = PathBuf::from(&cwd);
    memory::add_memory_entry(&cwd_path, &title, &content)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_memory(cwd: String, name: String) -> Result<bool, String> {
    let cwd_path = PathBuf::from(&cwd);
    Ok(memory::remove_memory_entry(&cwd_path, &name))
}
