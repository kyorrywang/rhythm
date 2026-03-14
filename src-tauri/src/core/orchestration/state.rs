use tokio::sync::Mutex;
use crate::core::infra::config_manager::ConfigManager;
use crate::core::project::workspace::WorkspaceManager;
use crate::core::orchestration::runtime::OrchestratorRuntime;

pub struct CoreState {
    pub config_manager: ConfigManager,
    pub workspace_manager: WorkspaceManager,
    pub runtime: Mutex<OrchestratorRuntime>,
}

impl CoreState {
    pub fn new() -> Self {
        Self {
            config_manager: ConfigManager::new(),
            workspace_manager: WorkspaceManager::new(),
            runtime: Mutex::new(OrchestratorRuntime::new()),
        }
    }
}
