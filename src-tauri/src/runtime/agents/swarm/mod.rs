pub mod agent_registry;
pub mod in_process;
pub mod mailbox;
pub mod permission_sync;
pub mod registry;
pub mod subprocess_backend;
pub mod team_lifecycle;
pub mod types;

pub use mailbox::TeammateMailbox;
pub use permission_sync::{list_pending_requests, SwarmPermissionRequest, SwarmPermissionResponse};
pub use registry::BackendRegistry;
pub use team_lifecycle::{TeamFile, TeamLifecycleManager, TeamMember};
pub use types::{
    AgentSummary, BackendType, SpawnResult, TeamSummary, TeammateMessage, TeammateSpawnConfig,
};
