pub use crate::domains::workspace::application::WorkspaceShellRunRequest;

#[tauri::command]
pub async fn workspace_info(
    path: String,
) -> Result<crate::domains::workspace::application::WorkspaceInfo, String> {
    crate::domains::workspace::application::workspace_info(path).await
}

#[tauri::command]
pub async fn workspace_list_dir(
    cwd: String,
    path: String,
) -> Result<crate::domains::workspace::application::WorkspaceDirList, String> {
    crate::domains::workspace::application::workspace_list_dir(cwd, path).await
}

#[tauri::command]
pub async fn workspace_read_text_file(
    cwd: String,
    path: String,
) -> Result<crate::domains::workspace::application::WorkspaceTextFile, String> {
    crate::domains::workspace::application::workspace_read_text_file(cwd, path).await
}

#[tauri::command]
pub async fn workspace_write_text_file(
    cwd: String,
    path: String,
    content: String,
) -> Result<crate::domains::workspace::application::WorkspaceWriteResult, String> {
    crate::domains::workspace::application::workspace_write_text_file(cwd, path, content).await
}

#[tauri::command]
pub async fn workspace_shell_run(
    request: WorkspaceShellRunRequest,
) -> Result<crate::domains::workspace::application::WorkspaceShellResult, String> {
    crate::domains::workspace::application::workspace_shell_run(request).await
}
