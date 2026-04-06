use crate::models::{ChatMessage, ChatMessageBlock, LlmClient, LlmToolDefinition};

// ─── Types ───────────────────────────────────────────────────────────────────

/// Which compression strategy was applied.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CompactType {
    /// Lightweight: strip ToolResult content from early messages.
    Micro,
    /// Full: summarise the entire history via an LLM call.
    Full,
}

/// State persisted across loop turns to avoid redundant compaction.
#[derive(Debug, Default)]
pub struct AutoCompactState {
    /// Number of messages present after the last full compact.
    last_compact_at: Option<usize>,
    /// How many micro-compacts have fired since the last full compact.
    micro_compact_count: usize,
}

/// Result of one compaction attempt.
pub struct CompactResult {
    pub messages: Vec<ChatMessage>,
    pub was_compacted: bool,
    pub compact_type: Option<CompactType>,
    pub tokens_saved: Option<usize>,
}

// ─── Public entry point ──────────────────────────────────────────────────────

/// Check whether the message history is approaching the token limit.
/// If so, apply the cheapest compression strategy that brings it below the
/// threshold, escalating from Micro → Full as needed.
pub async fn auto_compact_if_needed(
    messages: Vec<ChatMessage>,
    api_client: &dyn LlmClient,
    model: &str,
    system_prompt: &str,
    state: &mut AutoCompactState,
    token_limit: usize,
    max_micro_compacts: usize,
) -> CompactResult {
    let estimated = estimate_token_count(&messages);

    if estimated < token_limit {
        return CompactResult {
            messages,
            was_compacted: false,
            compact_type: None,
            tokens_saved: None,
        };
    }

    // ── Try micro-compact first (cheap) ──────────────────────────────────────
    if state.micro_compact_count < max_micro_compacts {
        let before = estimated;
        let compacted = micro_compact(&messages);
        let after = estimate_token_count(&compacted);

        if after < token_limit {
            state.micro_compact_count += 1;
            let saved = before.saturating_sub(after);
            return CompactResult {
                messages: compacted,
                was_compacted: true,
                compact_type: Some(CompactType::Micro),
                tokens_saved: Some(saved),
            };
        }
        // Micro wasn't enough — fall through to full compact
    }

    // ── Full LLM summary compact ─────────────────────────────────────────────
    let before = estimated;
    let compacted = full_compact(messages, api_client, model, system_prompt).await;
    let after = estimate_token_count(&compacted);

    state.micro_compact_count = 0;
    state.last_compact_at = Some(after); // track count *after* compact

    CompactResult {
        messages: compacted,
        was_compacted: true,
        compact_type: Some(CompactType::Full),
        tokens_saved: Some(before.saturating_sub(after)),
    }
}

// ─── Micro-compact ────────────────────────────────────────────────────────────

/// Strip `ToolResult` content from all but the most recent `keep_recent`
/// messages. The structural metadata (tool_call_id) is preserved so the
/// conversation remains valid.
fn micro_compact(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    let keep_recent = messages.len().saturating_sub(20);
    messages
        .iter()
        .enumerate()
        .map(|(i, msg)| {
            if i < keep_recent {
                strip_tool_result_content(msg)
            } else {
                msg.clone()
            }
        })
        .collect()
}

fn strip_tool_result_content(msg: &ChatMessage) -> ChatMessage {
    let mut msg = msg.clone();
    msg.blocks = msg
        .blocks
        .iter()
        .map(|block| match block {
            ChatMessageBlock::ToolResult {
                tool_call_id,
                is_error,
                ..
            } => ChatMessageBlock::ToolResult {
                tool_call_id: tool_call_id.clone(),
                content: "[content removed for context compression]".to_string(),
                is_error: *is_error,
            },
            other => other.clone(),
        })
        .collect();
    msg
}

// ─── Full compact ─────────────────────────────────────────────────────────────

/// Ask the LLM to summarise older conversation history while preserving the
/// latest non-system messages so the current task semantics remain intact.
async fn full_compact(
    messages: Vec<ChatMessage>,
    api_client: &dyn LlmClient,
    model: &str,
    original_system_prompt: &str,
) -> Vec<ChatMessage> {
    let recent_messages = select_recent_messages(&messages, 2);
    let old_messages = if recent_messages.len() < messages.len() {
        &messages[..messages.len() - recent_messages.len()]
    } else {
        &messages[..]
    };

    let history_text = format_messages_as_text(old_messages);
    let summary_prompt = format!(
        "Summarize the following conversation history concisely.\n\
         Preserve: key decisions made, files modified, current task state, \
         and any pending work. Output in structured markdown.\n\n{}",
        history_text
    );

    // Build a minimal single-turn request for the summary
    let summary_messages = vec![ChatMessage {
        role: "user".to_string(),
        blocks: vec![ChatMessageBlock::Text {
            text: summary_prompt,
        }],
    }];

    let summary = call_llm_for_summary(api_client, model, summary_messages).await;

    let mut compacted = vec![ChatMessage {
        role: "system".to_string(),
        blocks: vec![ChatMessageBlock::Text {
            text: format!(
                "{}\n\n# Conversation History Summary\n\n{}",
                original_system_prompt, summary
            ),
        }],
    }];
    compacted.extend(recent_messages);
    compacted
}

/// Drive the LLM to completion (no tools) and return the text output.
async fn call_llm_for_summary(
    api_client: &dyn LlmClient,
    model: &str,
    messages: Vec<ChatMessage>,
) -> String {
    use futures::StreamExt;
    use crate::models::LlmResponse;

    let _ = model; // model is baked into the client; exposed for future override support

    let mut text = String::new();
    let tools: Vec<LlmToolDefinition> = vec![]; // no tools for summary

    match api_client.chat_stream(messages, tools).await {
        Err(_) => "(summary unavailable)".to_string(),
        Ok(mut stream) => {
            while let Some(item) = stream.next().await {
                match item {
                    Ok(LlmResponse::TextDelta(delta)) => text.push_str(&delta),
                    Ok(LlmResponse::Done) | Err(_) => break,
                    _ => {}
                }
            }
            if text.is_empty() {
                "(summary unavailable)".to_string()
            } else {
                text
            }
        }
    }
}

// ─── Token estimation ─────────────────────────────────────────────────────────

/// Rough heuristic: ~3 chars per token on average for mixed EN/ZH content.
/// Back-of-envelope only; replace with tiktoken-rs for precision if needed.
pub fn estimate_token_count(messages: &[ChatMessage]) -> usize {
    messages
        .iter()
        .map(|m| content_text(m).len() / 3)
        .sum()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn content_text(msg: &ChatMessage) -> String {
    msg.blocks
        .iter()
        .map(|b| match b {
            ChatMessageBlock::Text { text } => text.as_str(),
            ChatMessageBlock::ToolResult { content, .. } => content.as_str(),
            _ => "",
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_messages_as_text(messages: &[ChatMessage]) -> String {
    messages
        .iter()
        .map(|m| format!("[{}]: {}", m.role, content_text(m)))
        .collect::<Vec<_>>()
        .join("\n---\n")
}

fn select_recent_messages(messages: &[ChatMessage], keep_non_system: usize) -> Vec<ChatMessage> {
    let mut kept = Vec::new();
    let mut remaining = keep_non_system;

    for msg in messages.iter().rev() {
        if msg.role != "system" {
            kept.push(msg.clone());
            remaining = remaining.saturating_sub(1);
            if remaining == 0 {
                break;
            }
        }
    }

    kept.reverse();
    kept
}
