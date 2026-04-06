pub mod agent_registry;
pub mod types;
pub mod registry;
pub mod subprocess_backend;
pub mod in_process;
pub mod mailbox;
pub mod permission_sync;
pub mod team_lifecycle;

pub use types::{TeammateSpawnConfig, SpawnResult, BackendType, TeammateMessage, TeamSummary, AgentSummary};
pub use registry::BackendRegistry;
pub use team_lifecycle::{TeamLifecycleManager, TeamFile, TeamMember};
pub use mailbox::TeammateMailbox;
pub use permission_sync::{SwarmPermissionRequest, SwarmPermissionResponse, list_pending_requests};
