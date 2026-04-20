use super::context::QueryContext;
use super::stream_events::{UsageSnapshot, UsageTracker};
use crate::infra::event_bus;
use crate::infra::llm::{ChatMessage, ChatMessageBlock};
use crate::shared::schema::EventPayload;

pub(super) fn estimate_input_chars(messages: &[ChatMessage]) -> usize {
    messages
        .iter()
        .map(|message| {
            message
                .blocks
                .iter()
                .map(|block| match block {
                    ChatMessageBlock::Text { text } => text.len(),
                    ChatMessageBlock::File { text, .. } => {
                        text.as_deref().map(str::len).unwrap_or(0)
                    }
                    ChatMessageBlock::ToolResult { content, .. } => content.len(),
                    _ => 0,
                })
                .sum::<usize>()
        })
        .sum()
}

pub(super) fn emit_thinking_end_once(context: &QueryContext, thinking_ended: &mut bool) {
    if *thinking_ended {
        return;
    }

    event_bus::emit(
        &context.agent_id,
        &context.session_id,
        EventPayload::ThinkingEnd,
    );
    *thinking_ended = true;
}

pub(super) fn record_turn_usage(
    context: &QueryContext,
    usage: &mut UsageTracker,
    input_chars: usize,
    output_chars: usize,
) {
    let usage_snapshot = UsageSnapshot::from_estimate(input_chars, output_chars);
    usage.add(&usage_snapshot);
    event_bus::emit(
        &context.agent_id,
        &context.session_id,
        EventPayload::UsageUpdate {
            input_tokens: usage.total.input_tokens,
            output_tokens: usage.total.output_tokens,
        },
    );
}
