use serde_json::Value;

use crate::plugins::tool_adapter::{run_plugin_runtime, PluginRuntimeCall, PluginRuntimeCallContext};
use crate::slash::host_api::PluginRuntimeHost;

use super::super::router::SlashExecutionOutcome;
use super::super::types::{
    PluginSlashRuntimeRequest, SlashCommandDescriptor, SlashRuntimeExecutionContext, SlashRuntimeInput,
};

pub async fn execute_plugin_command(
    descriptor: &SlashCommandDescriptor,
    user_input: &str,
    context: &SlashRuntimeExecutionContext,
) -> Result<SlashExecutionOutcome, String> {
    let plugin_name = &descriptor.provider.id;
    let cwd_path = std::path::Path::new(&context.cwd);
    let settings = crate::infrastructure::config::load_settings();
    let plugins = crate::plugins::loader::load_plugins(&settings, cwd_path);
    let plugin = plugins
        .iter()
        .find(|plugin| plugin.name() == plugin_name && plugin.is_runtime_active())
        .ok_or_else(|| format!("Slash plugin '{}' is not active", plugin_name))?;
    let slash = plugin
        .slash_contribution
        .as_ref()
        .ok_or_else(|| format!("Slash plugin '{}' does not declare contributes.slash", plugin_name))?;

    let runtime_entry = plugin.path.join(&slash.runtime_entry);
    if !runtime_entry.exists() {
        return Err(format!(
            "Slash plugin '{}' is missing runtime at '{}'",
            plugin_name,
            runtime_entry.display()
        ));
    }

    let request = PluginSlashRuntimeRequest {
        descriptor: descriptor.clone(),
        slash: crate::slash::types::PluginSlashContributionRuntimeConfig {
            commands_dir: slash.commands_dir.clone(),
            skills_dir: slash.skills_dir.clone(),
            runtime_entry: slash.runtime_entry.clone(),
        },
        input: SlashRuntimeInput {
            user_input: user_input.to_string(),
        },
        context: context.clone(),
    };

    let call = PluginRuntimeCall {
        id: format!(
            "slash-{}-{}",
            descriptor.name,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ),
        plugin: plugin_name.to_string(),
        command: descriptor.name.clone(),
        kind: "slash".to_string(),
        input: serde_json::to_value(request).map_err(|e| e.to_string())?,
        context: PluginRuntimeCallContext {
            cwd: context.cwd.clone(),
            session_id: Some(context.session_id.clone()),
            tool_call_id: None,
            plugin_storage_path: crate::infrastructure::paths::get_workspace_plugin_data_dir(
                cwd_path,
                plugin_name,
            )
            .to_string_lossy()
            .to_string(),
        },
    };

    let result = run_plugin_runtime(
        "node",
        &plugin.path,
        &slash.runtime_entry,
        "runCommand",
        &call,
        Some(PluginRuntimeHost {
            plugins: &plugins,
            caller_plugin: plugin_name,
            cwd: cwd_path,
            plugin_storage_path: crate::infrastructure::paths::get_workspace_plugin_data_dir(
                cwd_path,
                plugin_name,
            )
            .to_string_lossy()
            .to_string(),
            session_id: Some(&context.session_id),
            agent_id: Some(&context.agent_id),
            definition_id: Some(&context.definition_id),
            provider_id: Some(&context.provider_id),
            model: Some(&context.model),
            reasoning: Some(&context.reasoning),
        }),
    )
    .await?;

    interpret_plugin_result(result, descriptor)
}

fn interpret_plugin_result(
    value: Value,
    descriptor: &SlashCommandDescriptor,
) -> Result<SlashExecutionOutcome, String> {
    let status = value
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("handled");

    match status {
        "handled" => Ok(SlashExecutionOutcome::Handled),
        "prompt" => Ok(SlashExecutionOutcome::ContinueWithPrompt(
            value.get("prompt")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        )),
        "error" => Err(value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("slash runtime error")
            .to_string()),
        other => Err(format!(
            "Slash command '{}' returned unsupported runtime status '{}'",
            descriptor.name, other
        )),
    }
}
