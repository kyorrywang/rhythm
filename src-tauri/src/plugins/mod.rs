pub mod command_registry;
pub mod installer;
pub mod loader;
pub mod tool_adapter;
pub mod types;

pub use command_registry::{
    resolve_builtin_tool_alias, PluginCommandRegistry, ResolvedPluginCommand,
};
pub use installer::{
    install_plugin, preview_install_plugin, uninstall_plugin, PluginInstallPreview,
    PluginUninstallStoragePolicy,
};
pub use loader::{
    discover_plugin_paths, get_project_plugins_dir, get_user_plugins_dir,
    get_workspace_plugins_dir, load_plugin, load_plugins,
};
pub use tool_adapter::PluginToolAdapter;
pub use types::{LoadedPlugin, PluginManifest, PluginStatus, PluginSummary};
