pub mod installer;
pub mod loader;
pub mod types;

pub use installer::{install_plugin, uninstall_plugin};
pub use loader::{
    discover_plugin_paths, get_project_plugins_dir, get_user_plugins_dir, load_plugin, load_plugins,
};
pub use types::{LoadedPlugin, PluginManifest, PluginSummary};
