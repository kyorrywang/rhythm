use super::agent_loop::run_query;
use super::context::QueryContext;
use super::stream_events::UsageTracker;
use crate::llm::{ChatAttachment, ChatMessage, ChatMessageBlock};
use crate::shared::error::RhythmError;

/// High-level session object: wraps QueryContext, owns message history and usage.
pub struct QueryEngine {
    context: QueryContext,
    messages: Vec<ChatMessage>,
    usage_tracker: UsageTracker,
}

impl QueryEngine {
    pub fn new(context: QueryContext) -> Self {
        Self {
            context,
            messages: Vec::new(),
            usage_tracker: UsageTracker::default(),
        }
    }

    /// Inject or update the system prompt (call before the first submit_message).
    pub fn set_system_prompt(&mut self, prompt: String) {
        self.context.system_prompt = prompt;
    }

    /// Clear message history (start fresh for a new conversation in the same session).
    pub fn clear(&mut self) {
        self.messages.clear();
        self.usage_tracker = UsageTracker::default();
    }

    /// Return the current message history (immutable view).
    pub fn messages(&self) -> &[ChatMessage] {
        &self.messages
    }

    pub fn total_usage(&self) -> &super::stream_events::UsageSnapshot {
        &self.usage_tracker.total
    }

    /// Submit a user message and run the agent loop until completion.
    ///
    /// Returns the concatenated assistant text produced across all turns.
    pub async fn submit_message(&mut self, prompt: String) -> Result<String, RhythmError> {
        self.submit_message_with_attachments(prompt, Vec::new())
            .await
    }

    pub async fn submit_message_with_attachments(
        &mut self,
        prompt: String,
        attachments: Vec<ChatAttachment>,
    ) -> Result<String, RhythmError> {
        // Prepend system prompt if not already present
        if self.messages.is_empty() && !self.context.system_prompt.is_empty() {
            self.messages.push(ChatMessage {
                role: "system".to_string(),
                blocks: vec![ChatMessageBlock::Text {
                    text: self.context.system_prompt.clone(),
                }],
            });
        }

        // Append user message
        let mut blocks = Vec::new();
        if !prompt.trim().is_empty() {
            blocks.push(ChatMessageBlock::Text { text: prompt });
        }
        blocks.extend(attachments.into_iter().map(attachment_to_block));

        self.messages.push(ChatMessage {
            role: "user".to_string(),
            blocks,
        });

        run_query(&self.context, &mut self.messages, &mut self.usage_tracker).await
    }
}

fn attachment_to_block(attachment: ChatAttachment) -> ChatMessageBlock {
    if attachment.kind == "image" {
        if let Some(data_url) = attachment.data_url.or(attachment.preview_url) {
            if let Some((media_type, data)) = parse_data_url(&data_url) {
                return ChatMessageBlock::Image { media_type, data };
            }
        }
    }

    ChatMessageBlock::File {
        name: attachment.name,
        mime_type: attachment.mime_type,
        size: attachment.size,
        text: attachment.text,
    }
}

fn parse_data_url(data_url: &str) -> Option<(String, String)> {
    let (header, data) = data_url.split_once(',')?;
    let media_type = header
        .strip_prefix("data:")?
        .strip_suffix(";base64")?
        .to_string();
    Some((media_type, data.to_string()))
}
