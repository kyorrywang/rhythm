use serde_json::Value;
use tokio::sync::oneshot;

use super::agent_interrupt::wait_for_interrupt;
use super::context::QueryContext;
use crate::infra::event_bus;
use crate::infra::llm::ChatMessageBlock;
use crate::runtime::agents;
use crate::runtime::capabilities::tools::context::resolve_permission_path;
use crate::runtime::conversation::interrupts;
use crate::runtime::policy::permissions::runtime as permissions;
use crate::shared::schema::EventPayload;

pub(super) async fn ensure_tool_permission(
    context: &QueryContext,
    tool_name: &str,
    tool_id: &str,
    args: &Value,
    is_read_only: bool,
) -> Option<ChatMessageBlock> {
    let file_path = args
        .get("path")
        .and_then(|v| v.as_str())
        .and_then(|p| resolve_permission_path(&context.cwd, p).ok());
    let command = args
        .get("command")
        .and_then(|v| v.as_str())
        .map(String::from);

    let decision = context.permission_checker.evaluate(
        tool_name,
        is_read_only,
        file_path.as_deref(),
        command.as_deref(),
    );

    if decision.allowed {
        return None;
    }

    if !decision.requires_confirmation {
        return Some(ChatMessageBlock::ToolResult {
            tool_call_id: tool_id.to_string(),
            content: format!("Permission denied for '{}': {}", tool_name, decision.reason),
            is_error: true,
        });
    }

    if agents::is_swarm_worker() {
        return request_swarm_permission(context, tool_name, tool_id, args, &decision.reason).await;
    }

    request_user_permission(context, tool_name, tool_id, &decision.reason).await
}

async fn request_swarm_permission(
    context: &QueryContext,
    tool_name: &str,
    tool_id: &str,
    args: &Value,
    reason: &str,
) -> Option<ChatMessageBlock> {
    let team_name = agents::get_team_name().unwrap_or_default();
    let worker_id = agents::get_agent_id().unwrap_or_else(|| context.agent_id.clone());
    let request = crate::runtime::agents::swarm::permission_sync::SwarmPermissionRequest {
        id: format!("perm-{}", tool_id),
        worker_id: worker_id.clone(),
        worker_name: worker_id,
        team_name: team_name.clone(),
        tool_name: tool_name.to_string(),
        tool_use_id: tool_id.to_string(),
        description: reason.to_string(),
        input: args.clone(),
        status: "pending".to_string(),
        resolved_by: None,
        feedback: None,
    };

    if let Err(e) =
        crate::runtime::agents::swarm::permission_sync::write_permission_request(&request)
    {
        return Some(ChatMessageBlock::ToolResult {
            tool_call_id: tool_id.to_string(),
            content: format!("Failed to create swarm permission request: {}", e),
            is_error: true,
        });
    }

    match crate::runtime::agents::swarm::permission_sync::wait_for_permission_response(
        &team_name,
        &request.id,
        300_000,
    )
    .await
    {
        Ok(response) if response.allowed => None,
        Ok(response) => Some(ChatMessageBlock::ToolResult {
            tool_call_id: tool_id.to_string(),
            content: format!(
                "Permission denied for '{}': {}",
                tool_name,
                response
                    .feedback
                    .unwrap_or_else(|| "leader rejected".to_string())
            ),
            is_error: true,
        }),
        Err(e) => Some(ChatMessageBlock::ToolResult {
            tool_call_id: tool_id.to_string(),
            content: format!("Permission denied for '{}': {}", tool_name, e),
            is_error: true,
        }),
    }
}

async fn request_user_permission(
    context: &QueryContext,
    tool_name: &str,
    tool_id: &str,
    reason: &str,
) -> Option<ChatMessageBlock> {
    let (tx, rx) = oneshot::channel::<bool>();
    permissions::set_permission_waiter(tool_id.to_string(), tx).await;

    event_bus::emit(
        &context.agent_id,
        &context.session_id,
        EventPayload::PermissionRequest {
            tool_id: tool_id.to_string(),
            tool_name: tool_name.to_string(),
            reason: reason.to_string(),
        },
    );

    let approved = tokio::select! {
        approved = rx => approved.ok(),
        _ = wait_for_interrupt(&context.session_id) => None,
    };

    if approved.is_none() {
        permissions::remove_permission_waiter(tool_id).await;
    }

    match approved {
        Some(true) => None,
        _ => Some(ChatMessageBlock::ToolResult {
            tool_call_id: tool_id.to_string(),
            content: if interrupts::is_interrupted(&context.session_id).await {
                format!("Tool '{}' interrupted", tool_name)
            } else {
                format!("Permission denied for '{}': user rejected", tool_name)
            },
            is_error: true,
        }),
    }
}
