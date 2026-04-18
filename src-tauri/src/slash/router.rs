use super::provider;
use super::types::{SlashCommandDescriptor, SlashRuntimeExecutionContext};

pub enum SlashExecutionOutcome {
    ContinueWithPrompt(String),
    Handled,
}

pub async fn execute_slash_command(
    descriptor: &SlashCommandDescriptor,
    user_input: &str,
    context: &SlashRuntimeExecutionContext,
) -> Result<SlashExecutionOutcome, String> {
    match descriptor.provider.provider_type.as_str() {
        "builtin" => provider::builtin::execute_builtin_command(descriptor, user_input, context),
        "plugin" => provider::plugin::execute_plugin_command(descriptor, user_input, context).await,
        other => Err(format!("Unsupported slash provider '{}'", other)),
    }
}
