use super::context::QueryContext;
use crate::infra::event_bus;
use crate::shared::error::RhythmError;
use crate::shared::schema::EventPayload;

pub(super) fn enforce_completion_policy(
    context: &QueryContext,
    assistant_text: &str,
    used_subagent_tool: bool,
) -> Result<(), RhythmError> {
    if context.requires_delegation_for_completion && !used_subagent_tool {
        let message = if context.completion.strategy == "delegate_then_summarize" {
            "This task requires delegation before completion. Use `spawn_subagent` for the substantial work, then summarize the returned results."
        } else {
            "This task must delegate before it can be completed."
        };
        event_bus::emit(
            &context.agent_id,
            &context.session_id,
            EventPayload::TextDelta {
                content: format!(
                    "\n[Policy] {} Final inline answer blocked: {}",
                    message,
                    assistant_text.trim()
                ),
            },
        );
        return Err(RhythmError::PolicyViolation(message.to_string()));
    }
    Ok(())
}
