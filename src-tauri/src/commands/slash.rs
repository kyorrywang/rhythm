pub use crate::slash::types::{SlashCommandDescriptor, SlashCommandRegistryResponse};

#[tauri::command]
pub async fn list_slash_commands(cwd: String) -> Result<SlashCommandRegistryResponse, String> {
    let workspace_path = crate::commands::workspace::resolve_workspace_path(Some(&cwd))?;
    Ok(crate::slash::registry::load_slash_command_registry(&workspace_path))
}
