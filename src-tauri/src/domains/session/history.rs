use std::path::Path;

use crate::domains::session::repository::{
    self, AskQuestionSnapshot, AskResponseSnapshot, MessageSegmentSnapshot, MessageSnapshot,
    SessionSnapshot,
};
use crate::platform::llm::{ChatAttachment, ChatMessage, ChatMessageBlock};

pub async fn load_session_history(
    cwd_path: &Path,
    session_id: &str,
    prompt: &str,
    attachments: &[ChatAttachment],
) -> Result<Vec<ChatMessage>, String> {
    let Some(snapshot) = repository::get_session(cwd_path, session_id).await? else {
        return Ok(Vec::new());
    };

    Ok(rebuild_history_from_snapshot(snapshot, prompt, attachments))
}

pub fn rebuild_history_from_snapshot(
    snapshot: SessionSnapshot,
    prompt: &str,
    attachments: &[ChatAttachment],
) -> Vec<ChatMessage> {
    let mut messages: Vec<ChatMessage> = snapshot
        .messages
        .into_iter()
        .filter(|message| message.context_policy.as_deref() != Some("exclude"))
        .flat_map(snapshot_message_to_chat_messages)
        .collect();

    trim_pending_current_turn(&mut messages, prompt, attachments);
    messages
}

fn trim_pending_current_turn(
    messages: &mut Vec<ChatMessage>,
    prompt: &str,
    attachments: &[ChatAttachment],
) {
    while let Some(last) = messages.last() {
        let only_empty_assistant = last.role == "assistant"
            && !last.blocks.iter().any(|block| {
                matches!(block, ChatMessageBlock::Text { text } if !text.trim().is_empty())
                    || matches!(block, ChatMessageBlock::ToolCall { .. })
                    || matches!(block, ChatMessageBlock::ToolResult { .. })
            });
        if only_empty_assistant {
            messages.pop();
            continue;
        }
        break;
    }

    if matches!(
        messages.last(),
        Some(ChatMessage {
            role,
            blocks: _
        }) if role == "assistant"
    ) {
        let should_trim_assistant = messages
            .len()
            .checked_sub(2)
            .and_then(|index| messages.get(index))
            .map(|message| user_message_matches_turn(message, prompt, attachments))
            .unwrap_or(false);
        if should_trim_assistant {
            messages.pop();
        }
    }

    if matches!(
        messages.last(),
        Some(message) if user_message_matches_turn(message, prompt, attachments)
    ) {
        messages.pop();
    }
}

fn user_message_matches_turn(
    message: &ChatMessage,
    prompt: &str,
    attachments: &[ChatAttachment],
) -> bool {
    message.role == "user"
        && extract_text_from_blocks(&message.blocks).trim() == prompt.trim()
        && blocks_match_attachments(&message.blocks, attachments)
}

pub fn snapshot_message_to_chat_messages(message: MessageSnapshot) -> Vec<ChatMessage> {
    let role = message.role;
    let mut message_blocks = Vec::new();
    let mut tool_result_blocks = Vec::new();
    let mut followup_user_blocks = Vec::new();

    if let Some(content) = message.content {
        if !content.trim().is_empty() {
            message_blocks.push(ChatMessageBlock::Text { text: content });
        }
    }

    for attachment in message.attachments.unwrap_or_default() {
        if attachment.kind == "image" {
            if let Some(data_url) = attachment.data_url.or(attachment.preview_url) {
                if let Some((media_type, data)) = parse_data_url(&data_url) {
                    message_blocks.push(ChatMessageBlock::Image { media_type, data });
                    continue;
                }
            }
        }

        message_blocks.push(ChatMessageBlock::File {
            name: attachment.name,
            mime_type: attachment.mime_type,
            size: attachment.size.max(0) as u64,
            text: attachment.text,
        });
    }

    for segment in message.segments.unwrap_or_default() {
        match segment {
            MessageSegmentSnapshot::Text { content } => {
                if !content.trim().is_empty() {
                    message_blocks.push(ChatMessageBlock::Text { text: content });
                }
            }
            MessageSegmentSnapshot::Tool { tool } => {
                message_blocks.push(ChatMessageBlock::ToolCall {
                    id: tool.id.clone(),
                    name: tool.name,
                    arguments: tool.arguments,
                });
                if let Some(result) = tool.result {
                    tool_result_blocks.push(ChatMessageBlock::ToolResult {
                        tool_call_id: tool.id,
                        content: result,
                        is_error: tool.status == "error",
                    });
                }
            }
            MessageSegmentSnapshot::Ask {
                title,
                question,
                options,
                questions,
                status,
                answer,
                ..
            } => {
                message_blocks.push(ChatMessageBlock::Text {
                    text: render_ask_request_for_history(
                        &title,
                        &question,
                        &options,
                        questions.as_deref().unwrap_or(&[]),
                    ),
                });
                if status == "answered" {
                    if let Some(answer) = answer {
                        let rendered = render_ask_response_for_history(&answer);
                        if !rendered.is_empty() {
                            followup_user_blocks.push(ChatMessageBlock::Text { text: rendered });
                        }
                    }
                }
            }
            _ => {}
        }
    }

    let mut rebuilt = Vec::new();

    if !message_blocks.is_empty() {
        rebuilt.push(ChatMessage {
            role,
            blocks: message_blocks,
        });
    }

    if !tool_result_blocks.is_empty() {
        rebuilt.push(ChatMessage {
            role: "user".to_string(),
            blocks: tool_result_blocks,
        });
    }

    if !followup_user_blocks.is_empty() {
        rebuilt.push(ChatMessage {
            role: "user".to_string(),
            blocks: followup_user_blocks,
        });
    }

    rebuilt
}

fn render_ask_request_for_history(
    title: &str,
    question: &str,
    options: &[String],
    questions: &[AskQuestionSnapshot],
) -> String {
    let mut lines = Vec::new();
    let title = title.trim();
    if !title.is_empty() {
        lines.push(format!("Ask: {}", title));
    }

    if !questions.is_empty() {
        for item in questions {
            lines.push(format!("Q: {}", item.question));
            if !item.options.is_empty() {
                lines.push(format!("Options: {}", item.options.join(", ")));
            }
        }
    } else {
        let question = question.trim();
        if !question.is_empty() {
            lines.push(format!("Q: {}", question));
        }
        if !options.is_empty() {
            lines.push(format!("Options: {}", options.join(", ")));
        }
    }

    lines.join("\n")
}

fn render_ask_response_for_history(response: &AskResponseSnapshot) -> String {
    response
        .answers
        .iter()
        .map(|answer| {
            let selected = answer.selected.join(", ");
            let detail = answer.text.trim();
            [selected, detail.to_string()]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join(" | ")
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn extract_text_from_blocks(blocks: &[ChatMessageBlock]) -> String {
    blocks
        .iter()
        .filter_map(|block| match block {
            ChatMessageBlock::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn blocks_match_attachments(blocks: &[ChatMessageBlock], attachments: &[ChatAttachment]) -> bool {
    let block_attachments: Vec<&ChatMessageBlock> = blocks
        .iter()
        .filter(|block| {
            matches!(
                block,
                ChatMessageBlock::Image { .. } | ChatMessageBlock::File { .. }
            )
        })
        .collect();

    if block_attachments.len() != attachments.len() {
        return false;
    }

    block_attachments
        .iter()
        .zip(attachments.iter())
        .all(
            |(block, attachment)| match (block, attachment.kind.as_str()) {
                (ChatMessageBlock::Image { .. }, "image") => true,
                (
                    ChatMessageBlock::File {
                        name,
                        mime_type,
                        size,
                        text,
                    },
                    "file",
                ) => {
                    name == &attachment.name
                        && mime_type == &attachment.mime_type
                        && *size == attachment.size
                        && text.as_deref() == attachment.text.as_deref()
                }
                _ => false,
            },
        )
}

fn parse_data_url(data_url: &str) -> Option<(String, String)> {
    let (header, data) = data_url.split_once(',')?;
    let media_type = header
        .strip_prefix("data:")?
        .strip_suffix(";base64")?
        .to_string();
    Some((media_type, data.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domains::session::repository::{
        AskAnswerSnapshot, AskResponseSnapshot, ToolCallSnapshot,
    };
    use serde_json::json;

    #[test]
    fn snapshot_tool_segments_rebuild_into_assistant_then_user_tool_result_messages() {
        let rebuilt = snapshot_message_to_chat_messages(MessageSnapshot {
            id: "m1".to_string(),
            role: "assistant".to_string(),
            content: None,
            attachments: None,
            mode: None,
            slash_command_name: None,
            context_policy: None,
            model: None,
            created_at: 1,
            segments: Some(vec![MessageSegmentSnapshot::Tool {
                tool: ToolCallSnapshot {
                    id: "tool-1".to_string(),
                    name: "plan_tasks".to_string(),
                    arguments: json!({ "workspace": "demo", "tasks": [] }),
                    raw_arguments: Some("{\"workspace\":\"demo\",\"tasks\":[]}".to_string()),
                    is_preparing: Some(false),
                    result: Some("{\"workspace_path\":\"demo\"}".to_string()),
                    status: "completed".to_string(),
                    logs: None,
                    started_at: Some(1),
                    ended_at: Some(2),
                    sub_session_id: None,
                },
            }]),
            status: None,
            started_at: Some(1),
            ended_at: Some(2),
        });

        assert_eq!(rebuilt.len(), 2);
        assert_eq!(rebuilt[0].role, "assistant");
        assert!(matches!(
            rebuilt[0].blocks.first(),
            Some(ChatMessageBlock::ToolCall { id, .. }) if id == "tool-1"
        ));
        assert_eq!(rebuilt[1].role, "user");
        assert!(matches!(
            rebuilt[1].blocks.first(),
            Some(ChatMessageBlock::ToolResult { tool_call_id, .. }) if tool_call_id == "tool-1"
        ));
    }

    #[test]
    fn rebuild_history_skips_messages_marked_excluded_from_context() {
        let rebuilt = rebuild_history_from_snapshot(
            SessionSnapshot {
                id: "s1".to_string(),
                title: "demo".to_string(),
                updated_at: 2,
                workspace_path: None,
                messages: vec![
                    MessageSnapshot {
                        id: "m1".to_string(),
                        role: "user".to_string(),
                        content: Some("keep me".to_string()),
                        attachments: None,
                        mode: None,
                        slash_command_name: None,
                        context_policy: None,
                        model: None,
                        created_at: 1,
                        segments: None,
                        status: None,
                        started_at: None,
                        ended_at: None,
                    },
                    MessageSnapshot {
                        id: "m2".to_string(),
                        role: "user".to_string(),
                        content: Some("skip me".to_string()),
                        attachments: None,
                        mode: None,
                        slash_command_name: Some("btw".to_string()),
                        context_policy: Some("exclude".to_string()),
                        model: None,
                        created_at: 2,
                        segments: None,
                        status: None,
                        started_at: None,
                        ended_at: None,
                    },
                ],
                pinned: None,
                archived: None,
                has_unread_completed: None,
                task_dock_minimized: None,
                append_dock_minimized: None,
                parent_id: None,
                queued_messages: None,
                queue_state: None,
                usage: None,
                token_count: None,
                permission_grants: None,
                subagent_result: None,
                runtime: None,
                error: None,
            },
            "new prompt",
            &[],
        );

        assert_eq!(rebuilt.len(), 1);
        assert_eq!(extract_text_from_blocks(&rebuilt[0].blocks), "keep me");
    }

    #[test]
    fn snapshot_ask_segments_rebuild_into_assistant_prompt_and_user_answer_messages() {
        let rebuilt = snapshot_message_to_chat_messages(MessageSnapshot {
            id: "m1".to_string(),
            role: "assistant".to_string(),
            content: None,
            attachments: None,
            mode: None,
            slash_command_name: None,
            context_policy: None,
            model: None,
            created_at: 1,
            segments: Some(vec![MessageSegmentSnapshot::Ask {
                tool_id: "ask-1".to_string(),
                title: "Story setup".to_string(),
                question: "Choose a tone".to_string(),
                options: vec!["grim".to_string(), "bright".to_string()],
                selection_type: "single_with_input".to_string(),
                questions: Some(vec![AskQuestionSnapshot {
                    id: "question-1".to_string(),
                    question: "Choose a tone".to_string(),
                    options: vec!["grim".to_string(), "bright".to_string()],
                    selection_type: "single_with_input".to_string(),
                }]),
                status: "answered".to_string(),
                answer: Some(AskResponseSnapshot {
                    answers: vec![AskAnswerSnapshot {
                        question_id: Some("question-1".to_string()),
                        selected: vec!["grim".to_string()],
                        text: "lean tragic".to_string(),
                    }],
                }),
                started_at: Some(1),
                ended_at: Some(2),
            }]),
            status: None,
            started_at: Some(1),
            ended_at: Some(2),
        });

        assert_eq!(rebuilt.len(), 2);
        assert_eq!(rebuilt[0].role, "assistant");
        assert_eq!(
            extract_text_from_blocks(&rebuilt[0].blocks),
            "Ask: Story setup\nQ: Choose a tone\nOptions: grim, bright"
        );
        assert_eq!(rebuilt[1].role, "user");
        assert_eq!(
            extract_text_from_blocks(&rebuilt[1].blocks),
            "grim | lean tragic"
        );
    }
}
