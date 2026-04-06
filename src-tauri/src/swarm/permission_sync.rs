use serde::{Deserialize, Serialize};
use crate::infrastructure::paths;
use super::mailbox::{MailboxMessage, MessageType, TeammateMailbox, make_id, now_f64};

// ─── Data types ───────────────────────────────────────────────────────────────

/// A Worker's request asking the Leader for permission to execute an operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmPermissionRequest {
    /// Unique request ID (`perm-{hex_timestamp}-{hex_random}`).
    pub id: String,
    pub worker_id: String,
    pub worker_name: String,
    pub team_name: String,
    pub tool_name: String,
    pub tool_use_id: String,
    pub description: String,
    pub input: serde_json::Value,
    #[serde(default = "default_pending")]
    pub status: String,  // "pending" | "approved" | "rejected"
    pub resolved_by: Option<String>,
    pub feedback: Option<String>,
}

fn default_pending() -> String {
    "pending".to_string()
}

/// A Leader's decision on a permission request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmPermissionResponse {
    pub request_id: String,
    pub allowed: bool,
    pub feedback: Option<String>,
}

pub async fn wait_for_permission_response(
    team_name: &str,
    request_id: &str,
    timeout_ms: u64,
) -> Result<SwarmPermissionResponse, crate::shared::error::RhythmError> {
    let resolved_path = paths::get_teams_dir()
        .join(team_name)
        .join("permissions")
        .join("resolved")
        .join(format!("{}.json", request_id));

    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    loop {
        if resolved_path.exists() {
            let text = std::fs::read_to_string(&resolved_path)
                .map_err(crate::shared::error::RhythmError::IoError)?;
            let req: SwarmPermissionRequest = serde_json::from_str(&text)
                .map_err(|e| crate::shared::error::RhythmError::SerdeError(e.to_string()))?;
            return Ok(SwarmPermissionResponse {
                request_id: request_id.to_string(),
                allowed: req.status == "approved",
                feedback: req.feedback,
            });
        }

        if std::time::Instant::now() >= deadline {
            return Err(crate::shared::error::RhythmError::PermissionDenied {
                tool: request_id.to_string(),
                reason: "Timed out waiting for swarm permission approval".to_string(),
            });
        }

        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
}

// ─── Read-only tool fast-path ──────────────────────────────────────────────────

const READ_ONLY_TOOLS: &[&str] = &[
    "read_file", "shell_read", "skill",
];

pub fn is_read_only_tool(tool_name: &str) -> bool {
    READ_ONLY_TOOLS.contains(&tool_name)
}

// ─── File-based permission sync ───────────────────────────────────────────────

/// Write a permission request to `~/.rhythm/data/teams/{team}/permissions/pending/{id}.json`.
pub fn write_permission_request(request: &SwarmPermissionRequest) -> Result<(), crate::shared::error::RhythmError> {
    let pending_dir = paths::get_teams_dir()
        .join(&request.team_name)
        .join("permissions")
        .join("pending");
    std::fs::create_dir_all(&pending_dir).map_err(crate::shared::error::RhythmError::IoError)?;

    let path = pending_dir.join(format!("{}.json", request.id));
    let json = serde_json::to_string_pretty(request)
        .map_err(|e| crate::shared::error::RhythmError::SerdeError(e.to_string()))?;
    std::fs::write(path, json).map_err(crate::shared::error::RhythmError::IoError)?;
    Ok(())
}

/// Move a resolved permission request from `pending/` to `resolved/`.
pub fn resolve_permission_request(
    team_name: &str,
    request_id: &str,
    response: &SwarmPermissionResponse,
) -> Result<(), crate::shared::error::RhythmError> {
    let base = paths::get_teams_dir().join(team_name).join("permissions");
    let pending_path = base.join("pending").join(format!("{}.json", request_id));
    let resolved_dir = base.join("resolved");
    std::fs::create_dir_all(&resolved_dir).map_err(crate::shared::error::RhythmError::IoError)?;

    if pending_path.exists() {
        // Read and update the request
        let text = std::fs::read_to_string(&pending_path)
            .map_err(crate::shared::error::RhythmError::IoError)?;
        let mut req: SwarmPermissionRequest = serde_json::from_str(&text)
            .map_err(|e| crate::shared::error::RhythmError::SerdeError(e.to_string()))?;

        req.status = if response.allowed { "approved".to_string() } else { "rejected".to_string() };
        req.feedback = response.feedback.clone();

        let json = serde_json::to_string_pretty(&req)
            .map_err(|e| crate::shared::error::RhythmError::SerdeError(e.to_string()))?;
        let resolved_path = resolved_dir.join(format!("{}.json", request_id));
        std::fs::write(&resolved_path, json).map_err(crate::shared::error::RhythmError::IoError)?;
        let _ = std::fs::remove_file(pending_path);
    }
    Ok(())
}

/// List all pending permission requests for a team.
pub fn list_pending_requests(team_name: &str) -> Vec<SwarmPermissionRequest> {
    let pending_dir = paths::get_teams_dir()
        .join(team_name)
        .join("permissions")
        .join("pending");

    let Ok(dir) = std::fs::read_dir(&pending_dir) else { return vec![] };

    dir.flatten()
        .filter_map(|e| {
            let text = std::fs::read_to_string(e.path()).ok()?;
            serde_json::from_str(&text).ok()
        })
        .collect()
}

// ─── Mailbox-based permission sync ────────────────────────────────────────────

/// Send a `PermissionRequest` message to the Leader's mailbox.
pub async fn send_permission_request_via_mailbox(
    request: &SwarmPermissionRequest,
    leader_mailbox: &TeammateMailbox,
) -> Result<(), crate::shared::error::RhythmError> {
    let msg = MailboxMessage {
        id: make_id(),
        message_type: MessageType::PermissionRequest,
        sender: request.worker_id.clone(),
        recipient: "leader".to_string(),
        payload: serde_json::to_value(request)
            .map_err(|e| crate::shared::error::RhythmError::SerdeError(e.to_string()))?,
        timestamp: now_f64(),
        read: false,
    };
    leader_mailbox.write(msg).await
}

/// Send a `PermissionResponse` message to the Worker's mailbox.
pub async fn send_permission_response_via_mailbox(
    response: &SwarmPermissionResponse,
    worker_mailbox: &TeammateMailbox,
) -> Result<(), crate::shared::error::RhythmError> {
    let msg = MailboxMessage {
        id: make_id(),
        message_type: MessageType::PermissionResponse,
        sender: "leader".to_string(),
        recipient: "worker".to_string(),
        payload: serde_json::to_value(response)
            .map_err(|e| crate::shared::error::RhythmError::SerdeError(e.to_string()))?,
        timestamp: now_f64(),
        read: false,
    };
    worker_mailbox.write(msg).await
}
