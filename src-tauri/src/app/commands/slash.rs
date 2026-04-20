pub use crate::runtime::capabilities::slash::types::{
    SlashCommandDescriptor, SlashCommandRegistryResponse,
};

#[tauri::command]
pub async fn list_slash_commands(cwd: String) -> Result<SlashCommandRegistryResponse, String> {
    let workspace_path =
        crate::runtime::context::workspace::application::resolve_workspace_path(Some(&cwd))?;
    Ok(crate::runtime::capabilities::slash::registry::load_slash_command_registry(&workspace_path))
}
