use crate::permissions::PermissionMode;
use serde::{Deserialize, Serialize};

// ─── Spawn config ─────────────────────────────────────────────────────────────

/// All parameters needed to start a new Worker Agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeammateSpawnConfig {
    /// Human-readable agent name (e.g. "frontend-worker").
    pub name: String,
    /// Logical team this agent belongs to.
    pub team: String,
    /// Initial prompt / task description.
    pub prompt: String,
    /// Working directory for the agent.
    pub cwd: String,
    /// Session ID of the parent (Leader) session.
    pub parent_session_id: String,
    /// Optional model override.
    pub model: Option<String>,
    /// Optional agent-type routing key (e.g. "worker", "explorer").
    pub subagent_type: Option<String>,
    /// Optional permission mode override for this worker.
    pub permission_mode: Option<PermissionMode>,
    /// Optional permission grants (tool names or glob patterns).
    pub permissions: Vec<String>,
    /// Pre-assigned session ID for the Worker (generated if `None`).
    pub session_id: Option<String>,
    /// If set, the Worker runs inside this Git Worktree path.
    pub worktree_path: Option<String>,
}

// ─── Spawn result ─────────────────────────────────────────────────────────────

/// What the backend returns after successfully spawning a Worker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnResult {
    /// Persistent task identifier.
    pub task_id: String,
    /// Composite agent identifier: `{name}@{team}`.
    pub agent_id: String,
    /// Which execution backend was used.
    pub backend_type: BackendType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackendType {
    /// Spawns a separate OS process running Rhythm in headless mode.
    Subprocess,
    /// Runs the Agent as a Tokio task inside the current process.
    InProcess,
}

// ─── Inter-agent message ──────────────────────────────────────────────────────

/// A text message sent between agents via the mailbox.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeammateMessage {
    /// Message body.
    pub text: String,
    /// Agent ID of the sender.
    pub from_agent: String,
    /// Optional brief title shown in the UI.
    pub summary: Option<String>,
}

// ─── Summary types exposed to the frontend ────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct TeamSummary {
    pub name: String,
    pub description: String,
    pub member_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentSummary {
    pub agent_id: String,
    pub name: String,
    pub backend_type: BackendType,
    pub status: String,
    pub joined_at: f64,
}
