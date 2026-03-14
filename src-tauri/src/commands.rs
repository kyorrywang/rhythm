use tauri::{AppHandle, Emitter, State, Window};
use serde::{Serialize, Deserialize};
use serde_json::json;

use crate::sidecar::SidecarState;

#[tauri::command]
pub async fn init_workspace(
    state: State<'_, SidecarState>,
    workspace_path: String,
) -> Result<(), String> {
    state.call("init_workspace", json!({ "workspace_path": workspace_path })).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_sessions(
    state: State<'_, SidecarState>,
    workspace_path: String,
) -> Result<Vec<String>, String> {
    let res = state.call("list_sessions", json!({ "workspace_path": workspace_path })).await?;
    serde_json::from_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_session_history(
    state: State<'_, SidecarState>,
    workspace_path: String,
    session_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let res = state.call("get_session_history", json!({
        "workspace_path": workspace_path,
        "session_id": session_id
    })).await?;
    serde_json::from_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_workspace_tree(path: String) -> Result<Vec<serde_json::Value>, String> {
    // We can implement file tree directly in Rust for better performance
    // For now, returning empty to be implemented later or via sidecar
    Ok(vec![])
}

#[tauri::command]
pub async fn list_workflow_templates(
    state: State<'_, SidecarState>,
    workspace_path: String,
) -> Result<Vec<serde_json::Value>, String> {
    let res = state.call("list_workflow_templates", json!({ "workspace_path": workspace_path })).await?;
    serde_json::from_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_workflow_instances(
    state: State<'_, SidecarState>,
    workspace_path: String,
) -> Result<Vec<serde_json::Value>, String> {
    let res = state.call("list_workflow_instances", json!({ "workspace_path": workspace_path })).await?;
    serde_json::from_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_global_config(state: State<'_, SidecarState>) -> Result<serde_json::Value, String> {
    state.call("get_global_config", json!({})).await
}

#[tauri::command]
pub async fn save_global_config(
    state: State<'_, SidecarState>,
    config: serde_json::Value,
) -> Result<(), String> {
    state.call("save_global_config", json!({ "config": config })).await?;
    Ok(())
}

#[tauri::command]
pub async fn start_chat(
    state: State<'_, SidecarState>,
    session_id: String,
    message: String,
    workspace_path: String,
) -> Result<(), String> {
    // This call initiates the stream. 
    // The sidecar module will handle capturing the stdout and emitting events.
    state.call("start_chat", json!({
        "session_id": session_id,
        "message": message,
        "workspace_path": workspace_path
    })).await?;
    
    Ok(())
}
