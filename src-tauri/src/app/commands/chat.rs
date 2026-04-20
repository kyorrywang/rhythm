use tauri::ipc::Channel;

use crate::infra::llm::ChatAttachment;
use crate::shared::schema::{AskAnswer, AskResponse, ServerEventChunk};

#[tauri::command]
pub async fn chat_stream(
    session_id: String,
    prompt: String,
    attachments: Option<Vec<ChatAttachment>>,
    cwd: Option<String>,
    agent_id: Option<String>,
    permission_mode: Option<String>,
    allowed_tools: Option<Vec<String>>,
    disallowed_tools: Option<Vec<String>>,
    provider_id: Option<String>,
    model: Option<String>,
    reasoning: Option<String>,
    slash_command_name: Option<String>,
    on_event: Channel<ServerEventChunk>,
) -> Result<(), String> {
    crate::runtime::conversation::application::chat_stream(
        session_id,
        prompt,
        attachments,
        cwd,
        agent_id,
        permission_mode,
        allowed_tools,
        disallowed_tools,
        provider_id,
        model,
        reasoning,
        slash_command_name,
        on_event,
    )
    .await
}

#[tauri::command]
pub async fn attach_session_stream(
    session_id: String,
    after_event_id: Option<u64>,
    on_event: Channel<ServerEventChunk>,
) -> Result<bool, String> {
    crate::runtime::conversation::application::attach_session_stream(
        session_id,
        after_event_id,
        on_event,
    )
    .await
}

#[tauri::command]
pub async fn submit_user_answer(
    tool_id: String,
    answer: String,
    record: Option<AskResponse>,
) -> Result<(), String> {
    let structured = record.unwrap_or_else(|| AskResponse {
        answers: vec![AskAnswer {
            question_id: "question-1".to_string(),
            selected: Vec::new(),
            text: answer,
        }],
    });
    crate::runtime::conversation::ask::resume_ask(&tool_id, structured).await
}

#[tauri::command]
pub async fn approve_permission(tool_id: String, approved: bool) -> Result<(), String> {
    crate::runtime::policy::permissions::runtime::resolve_permission(&tool_id, approved).await
}
