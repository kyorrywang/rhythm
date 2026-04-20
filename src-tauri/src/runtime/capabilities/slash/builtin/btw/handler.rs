use crate::runtime::capabilities::slash::router::SlashExecutionOutcome;
use crate::runtime::capabilities::slash::types::{
    SlashCommandDescriptor, SlashRuntimeExecutionContext,
};

pub fn execute(
    _descriptor: &SlashCommandDescriptor,
    user_input: &str,
    _context: &SlashRuntimeExecutionContext,
) -> Result<SlashExecutionOutcome, String> {
    Ok(SlashExecutionOutcome::ContinueWithPrompt(
        user_input.to_string(),
    ))
}
