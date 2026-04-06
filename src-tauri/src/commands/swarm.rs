use crate::swarm::{
    TeamLifecycleManager, TeamSummary, AgentSummary,
    SwarmPermissionResponse, list_pending_requests, SwarmPermissionRequest,
};

/// List all teams that have persistent state on disk.
#[tauri::command]
pub async fn list_teams() -> Result<Vec<TeamSummary>, String> {
    let lifecycle = TeamLifecycleManager::new();
    let summaries = lifecycle
        .list_teams()
        .into_iter()
        .map(|t| TeamSummary {
            name: t.name.clone(),
            description: t.description.clone(),
            member_count: t.members.len(),
        })
        .collect();
    Ok(summaries)
}

/// List all agents currently registered in the given team.
#[tauri::command]
pub async fn list_team_agents(team: String) -> Result<Vec<AgentSummary>, String> {
    let lifecycle = TeamLifecycleManager::new();
    Ok(lifecycle.list_agents_in_team(&team))
}

/// Approve or deny a Worker Agent's permission request.
#[tauri::command]
pub async fn approve_worker_permission(
    team: String,
    request_id: String,
    approved: bool,
    feedback: Option<String>,
) -> Result<(), String> {
    let response = SwarmPermissionResponse {
        request_id: request_id.clone(),
        allowed: approved,
        feedback,
    };
    crate::swarm::permission_sync::resolve_permission_request(&team, &request_id, &response)
        .map_err(|e| e.to_string())
}

/// List all pending permission requests for a team (shown in the Leader UI).
#[tauri::command]
pub async fn list_pending_permissions(team: String) -> Result<Vec<SwarmPermissionRequest>, String> {
    Ok(list_pending_requests(&team))
}
