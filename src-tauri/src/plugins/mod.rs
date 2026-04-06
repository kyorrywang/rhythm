pub mod types;
pub mod loader;
pub mod installer;

pub use types::{LoadedPlugin, PluginManifest, PluginSummary};
pub use loader::{discover_plugin_paths, load_plugin, load_plugins, get_user_plugins_dir, get_project_plugins_dir};
pub use installer::{install_plugin, uninstall_plugin};
