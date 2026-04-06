use crate::models::ChatMessage;
use crate::shared::error::RhythmError;
use super::context::QueryContext;
use super::stream_events::UsageTracker;
use super::agent_loop::run_query;

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
        // Prepend system prompt if not already present
        if self.messages.is_empty() && !self.context.system_prompt.is_empty() {
            self.messages.push(ChatMessage {
                role: "system".to_string(),
                blocks: vec![crate::models::ChatMessageBlock::Text {
                    text: self.context.system_prompt.clone(),
                }],
            });
        }

        // Append user message
        self.messages.push(ChatMessage {
            role: "user".to_string(),
            blocks: vec![crate::models::ChatMessageBlock::Text { text: prompt }],
        });

        run_query(&self.context, &mut self.messages, &mut self.usage_tracker).await
    }
}
