use super::super::builtin;
use super::super::router::SlashExecutionOutcome;
use super::super::types::{SlashCommandDescriptor, SlashRuntimeExecutionContext};

pub fn execute_builtin_command(
    descriptor: &SlashCommandDescriptor,
    user_input: &str,
    context: &SlashRuntimeExecutionContext,
) -> Result<SlashExecutionOutcome, String> {
    let package = builtin::resolve_package(&descriptor.provider.id).ok_or_else(|| {
        format!(
            "Unsupported builtin slash package '{}'",
            descriptor.provider.id
        )
    })?;
    (package.handler)(descriptor, user_input, context)
}
