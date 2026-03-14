use tauri::{State, Window};
use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;
use crate::core::orchestration::state::CoreState;
use crate::core::memory::session_store::SessionStore;
use crate::core::capabilities::workflow::engine::WorkflowEngine;

#[tauri::command]
pub async fn init_workspace(
    state: State<'_, CoreState>,
    workspace_path: String,
) -> Result<(), String> {
    state.workspace_manager.init_workspace(&workspace_path).map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(
    _state: State<'_, CoreState>,
    workspace_path: String,
) -> Result<Vec<String>, String> {
    let store = SessionStore::new(&workspace_path);
    store.list_sessions().map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn get_session_history(
    _state: State<'_, CoreState>,
    workspace_path: String,
    session_id: String,
) -> Result<Vec<Value>, String> {
    let store = SessionStore::new(&workspace_path);
    let history = store.load(&session_id).map_err(|e: anyhow::Error| e.to_string())?;
    Ok(history.into_iter().map(|m| serde_json::to_value(m).unwrap()).collect())
}

fn build_tree(path: &PathBuf, max_depth: usize, current_depth: usize) -> Vec<Value> {
    let mut items = vec![];
    if current_depth > max_depth {
        return items;
    }

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name == ".git" || file_name == ".rhythm" || file_name == "node_modules" || file_name == "__pycache__" {
                continue;
            }

            let file_path = entry.path();
            let is_dir = file_path.is_dir();
            
            let mut item = json!({
                "name": file_name,
                "is_dir": is_dir,
                "path": file_path.to_string_lossy().to_string()
            });

            if is_dir {
                if let Some(obj) = item.as_object_mut() {
                    obj.insert("children".to_string(), Value::Array(build_tree(&file_path, max_depth, current_depth + 1)));
                }
            }
            items.push(item);
        }
    }

    items.sort_by(|a, b| {
        let a_is_dir = a.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
        let b_is_dir = b.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
        if a_is_dir && !b_is_dir {
            std::cmp::Ordering::Less
        } else if !a_is_dir && b_is_dir {
            std::cmp::Ordering::Greater
        } else {
            let a_name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
            a_name.cmp(b_name)
        }
    });

    items
}

#[tauri::command]
pub async fn list_workspace_tree(path: String) -> Result<Vec<Value>, String> {
    let target_dir = PathBuf::from(path);
    if !target_dir.exists() || !target_dir.is_dir() {
        return Ok(vec![]);
    }
    
    Ok(build_tree(&target_dir, 3, 0))
}

#[tauri::command]
pub async fn list_workflow_templates(
    _state: State<'_, CoreState>,
    workspace_path: String,
) -> Result<Vec<Value>, String> {
    let engine = WorkflowEngine::new(&workspace_path);
    let templates = engine.list_templates().map_err(|e: anyhow::Error| e.to_string())?;
    Ok(templates.into_iter().map(|t| serde_json::to_value(t).unwrap()).collect())
}

#[tauri::command]
pub async fn list_workflow_instances(
    _state: State<'_, CoreState>,
    workspace_path: String,
) -> Result<Vec<Value>, String> {
    let engine = WorkflowEngine::new(&workspace_path);
    let instances = engine.get_instances_for_session("").map_err(|e: anyhow::Error| e.to_string())?;
    Ok(instances.into_iter().map(|i| serde_json::to_value(i).unwrap()).collect())
}

#[tauri::command]
pub async fn get_global_config(state: State<'_, CoreState>) -> Result<Value, String> {
    Ok(state.config_manager.get_global_config())
}

#[tauri::command]
pub async fn save_global_config(
    state: State<'_, CoreState>,
    config: Value,
) -> Result<(), String> {
    state.config_manager.save_global_config(config).map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn start_chat(
    state: State<'_, CoreState>,
    window: Window,
    session_id: String,
    message: String,
    workspace_path: String,
) -> Result<(), String> {
    let runtime = state.runtime.lock().await;
    runtime.handle_chat_stream(&window, &session_id, &message, &workspace_path).await.map_err(|e: anyhow::Error| e.to_string())
}
