use super::in_process::InProcessBackend;
use super::subprocess_backend::SubprocessBackend;
use super::types::{BackendType, SpawnResult, TeammateMessage, TeammateSpawnConfig};

// ─── BackendRegistry ──────────────────────────────────────────────────────────

/// Selects the appropriate execution backend for spawning Workers.
///
/// Priority:
/// 1. **InProcess** – the currently supported default worker runtime.
/// 2. **Subprocess** – experimental opt-in backend.
pub struct BackendRegistry {
    pub subprocess: SubprocessBackend,
    pub in_process: InProcessBackend,
}

impl BackendRegistry {
    pub fn new() -> Self {
        Self {
            subprocess: SubprocessBackend::new(),
            in_process: InProcessBackend::new(),
        }
    }

    /// Choose backend and spawn a Worker.
    ///
    /// `preferred` defaults to `InProcess`.
    pub async fn spawn(
        &self,
        config: TeammateSpawnConfig,
        preferred: Option<BackendType>,
    ) -> SpawnResult {
        match preferred.unwrap_or(BackendType::InProcess) {
            BackendType::InProcess => self.in_process.spawn(config).await,
            BackendType::Subprocess => self.subprocess.spawn(config).await,
        }
    }

    pub async fn send_message(
        &self,
        backend_type: &BackendType,
        agent_id: &str,
        message: TeammateMessage,
    ) {
        match backend_type {
            BackendType::InProcess => self.in_process.send_message(agent_id, message).await,
            BackendType::Subprocess => self.subprocess.send_message(agent_id, message).await,
        }
    }

    pub async fn shutdown(
        &self,
        backend_type: &BackendType,
        agent_id: &str,
        force: bool,
    ) {
        match backend_type {
            BackendType::InProcess => self.in_process.shutdown(agent_id, force).await,
            BackendType::Subprocess => self.subprocess.shutdown(agent_id, force).await,
        }
    }
}

impl Default for BackendRegistry {
    fn default() -> Self {
        Self::new()
    }
}
