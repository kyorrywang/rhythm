pub mod command_registry;
pub mod installer;
pub mod loader;
pub mod tool_adapter;
pub mod types;

pub use command_registry::PluginCommandRegistry;
pub use installer::{install_plugin, uninstall_plugin};
pub use loader::{
    discover_plugin_paths, get_project_plugins_dir, get_user_plugins_dir,
    get_workspace_plugins_dir, load_plugin, load_plugins,
};
pub use tool_adapter::PluginToolAdapter;
pub use types::{LoadedPlugin, PluginManifest, PluginStatus, PluginSummary};
