use super::{PluginCommandDefinition, PluginCommandExecution, ResolvedPluginCommand};
use crate::domains::plugins::tool_adapter::{
    run_plugin_runtime, PluginRuntimeCall, PluginRuntimeCallContext,
};
use crate::domains::plugins::types::LoadedPlugin;
use crate::domains::slash::host_api::PluginRuntimeHost;
use crate::domains::tools::{ToolExecutionContext, ToolRegistry};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

pub(super) fn plugin_has_granted_permission(plugin: &LoadedPlugin, permission: &str) -> bool {
    let requested = plugin.manifest.permissions.iter().any(|entry| entry == "*")
        || plugin
            .manifest
            .permissions
            .iter()
            .any(|entry| entry == permission);
    let granted = plugin.granted_permissions.iter().any(|entry| entry == "*")
        || plugin
            .granted_permissions
            .iter()
            .any(|entry| entry == permission);
    requested && granted
}

pub(super) async fn execute_tool_command(
    plugins: &[LoadedPlugin],
    plugin_name: &str,
    command_id: &str,
    tool_name: &str,
    input: Value,
    cwd: &Path,
) -> Result<PluginCommandExecution, String> {
    let registry = ToolRegistry::create_with_plugins_and_mcp(plugins, None);
    let resolved_tool_name = resolve_builtin_tool_alias(tool_name);
    let tool = registry
        .get(resolved_tool_name)
        .ok_or_else(|| format!("Tool '{}' is not registered", tool_name))?;
    let ctx = ToolExecutionContext {
        cwd: cwd.to_path_buf(),
        agent_id: "plugin-command".to_string(),
        session_id: "plugin-command".to_string(),
        tool_call_id: command_id.to_string(),
        metadata: HashMap::new(),
    };
    let result = tool.execute(input, &ctx).await;
    if result.is_error {
        return Err(result.output);
    }
    let result_value = serde_json::from_str(&result.output)
        .unwrap_or_else(|_| serde_json::json!({ "output": result.output }));
    Ok(PluginCommandExecution {
        plugin_name: plugin_name.to_string(),
        command_id: command_id.to_string(),
        handled: true,
        result: result_value,
    })
}

pub(super) fn register_builtin_tool_commands(
    commands: &mut HashMap<String, PluginCommandDefinition>,
) {
    commands.insert(
        "core.llm.complete".to_string(),
        PluginCommandDefinition {
            id: "core.llm.complete".to_string(),
            plugin_name: "core.tools".to_string(),
            tool: None,
            implementation: Some("builtin".to_string()),
            entry: None,
            handler: None,
            permissions: Vec::new(),
            parameters: Some(serde_json::json!({
                "type": "object",
                "properties": {
                    "prompt": { "type": "string" },
                    "systemPrompt": { "type": "string" },
                    "providerId": { "type": "string" },
                    "model": { "type": "string" },
                    "timeoutSecs": { "type": "number" }
                },
                "required": ["prompt"]
            })),
            declaration: serde_json::json!({
                "id": "core.llm.complete",
                "implementation": "builtin",
                "readOnly": false
            }),
        },
    );

    for (command_id, tool_name, read_only, permissions) in [
        ("tool.read_file", "read", true, vec!["workspace.files.read"]),
        (
            "tool.list_dir",
            "list_dir",
            true,
            vec!["workspace.files.read"],
        ),
        (
            "tool.write_file",
            "write",
            false,
            vec!["workspace.files.write"],
        ),
        (
            "tool.edit_file",
            "edit",
            false,
            vec!["workspace.files.write"],
        ),
        (
            "tool.delete_file",
            "delete",
            false,
            vec!["workspace.files.write"],
        ),
        ("tool.shell", "shell", false, vec!["terminal.run"]),
    ] {
        commands.insert(
            command_id.to_string(),
            PluginCommandDefinition {
                id: command_id.to_string(),
                plugin_name: "core.tools".to_string(),
                tool: Some(tool_name.to_string()),
                implementation: None,
                entry: None,
                handler: None,
                permissions: permissions.into_iter().map(str::to_string).collect(),
                parameters: Some(
                    ToolRegistry::create_default()
                        .get(tool_name)
                        .map(|tool| tool.parameters())
                        .unwrap_or_else(|| serde_json::json!({ "type": "object" })),
                ),
                declaration: serde_json::json!({
                    "id": command_id,
                    "tool": tool_name,
                    "readOnly": read_only
                }),
            },
        );
    }
}

pub(super) async fn execute_llm_complete_command(
    command_id: &str,
    input: Value,
) -> Result<PluginCommandExecution, String> {
    let prompt = input
        .get("prompt")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if prompt.trim().is_empty() {
        return Err("core.llm.complete requires a non-empty prompt".to_string());
    }
    let system_prompt = input
        .get("systemPrompt")
        .and_then(Value::as_str)
        .map(str::to_string);
    let provider_id = input
        .get("providerId")
        .and_then(Value::as_str)
        .map(str::to_string);
    let model = input
        .get("model")
        .and_then(Value::as_str)
        .map(str::to_string);
    let timeout_secs = input.get("timeoutSecs").and_then(Value::as_u64);
    let mut messages = Vec::new();
    if let Some(system_prompt) = system_prompt.filter(|value| !value.trim().is_empty()) {
        messages.push(crate::app::commands::llm::LlmCompleteMessage {
            role: "system".to_string(),
            content: system_prompt,
        });
    }
    messages.push(crate::app::commands::llm::LlmCompleteMessage {
        role: "user".to_string(),
        content: prompt,
    });
    let text =
        crate::app::commands::llm::llm_complete(messages, provider_id, model, timeout_secs).await?;
    Ok(PluginCommandExecution {
        plugin_name: "core.tools".to_string(),
        command_id: command_id.to_string(),
        handled: true,
        result: serde_json::json!({ "text": text }),
    })
}

pub(super) async fn execute_runtime_command(
    plugins: &[LoadedPlugin],
    resolved: &ResolvedPluginCommand,
    input: Value,
    cwd: &Path,
) -> Result<PluginCommandExecution, String> {
    let provider = plugins
        .iter()
        .find(|plugin| plugin.name() == resolved.provider_plugin);
    let Some(provider) = provider else {
        return Err(format!(
            "Command '{}' provider '{}' is not installed",
            resolved.definition.id, resolved.provider_plugin
        ));
    };
    let Some(entry) = resolved.definition.entry.as_deref() else {
        return Err(format!(
            "Command '{}' is missing entry",
            resolved.definition.id
        ));
    };
    let Some(handler) = resolved.definition.handler.as_deref() else {
        return Err(format!(
            "Command '{}' is missing handler",
            resolved.definition.id
        ));
    };
    let call = PluginRuntimeCall {
        id: resolved.definition.id.clone(),
        plugin: provider.name().to_string(),
        command: resolved.definition.id.clone(),
        kind: "command".to_string(),
        input,
        context: PluginRuntimeCallContext {
            cwd: cwd.to_string_lossy().to_string(),
            session_id: None,
            tool_call_id: None,
            plugin_storage_path: crate::platform::paths::get_workspace_plugin_data_dir(
                cwd,
                provider.name(),
            )
            .to_string_lossy()
            .to_string(),
        },
    };
    let result = run_plugin_runtime(
        resolved
            .definition
            .implementation
            .as_deref()
            .unwrap_or_default(),
        &provider.path,
        entry,
        handler,
        &call,
        Some(PluginRuntimeHost {
            plugins,
            caller_plugin: provider.name(),
            cwd,
            plugin_storage_path: crate::platform::paths::get_workspace_plugin_data_dir(
                cwd,
                provider.name(),
            )
            .to_string_lossy()
            .to_string(),
            session_id: None,
            agent_id: None,
            definition_id: None,
            provider_id: None,
            model: None,
            reasoning: None,
        }),
    )
    .await?;
    Ok(PluginCommandExecution {
        plugin_name: provider.name().to_string(),
        command_id: resolved.definition.id.clone(),
        handled: true,
        result,
    })
}

pub(super) fn resolve_builtin_tool_alias(tool_name: &str) -> &str {
    match tool_name {
        "tool.read_file" => "read",
        "tool.list_dir" => "list_dir",
        "tool.write_file" => "write",
        "tool.edit_file" => "edit",
        "tool.delete_file" => "delete",
        "tool.shell" => "shell",
        other => other,
    }
}

pub(super) fn validate_permissions(
    plugin: &LoadedPlugin,
    permissions: &[String],
) -> Result<(), String> {
    for permission in permissions {
        let requested = plugin.manifest.permissions.iter().any(|entry| entry == "*")
            || plugin
                .manifest
                .permissions
                .iter()
                .any(|entry| entry == permission);
        let granted = plugin.granted_permissions.iter().any(|entry| entry == "*")
            || plugin
                .granted_permissions
                .iter()
                .any(|entry| entry == permission);
        if !requested {
            return Err(format!(
                "Plugin '{}' did not declare permission '{}'",
                plugin.name(),
                permission
            ));
        }
        if !granted {
            return Err(format!(
                "Plugin '{}' is missing granted permission '{}'",
                plugin.name(),
                permission
            ));
        }
    }
    Ok(())
}

pub(super) fn validate_schema(schema: Option<&Value>, input: &Value) -> Result<(), String> {
    let Some(schema) = schema else {
        return Ok(());
    };
    let Some(schema_object) = schema.as_object() else {
        return Ok(());
    };
    if let Some(expected_type) = schema_object.get("type").and_then(Value::as_str) {
        if !matches_json_schema_type(input, expected_type) {
            return Err(format!(
                "Input schema validation failed: expected {}, got {}",
                expected_type,
                json_value_type(input)
            ));
        }
    }
    if schema_object.get("type").and_then(Value::as_str) == Some("object") {
        if let Some(required) = schema_object.get("required").and_then(Value::as_array) {
            let Some(input_object) = input.as_object() else {
                return Err("Input schema validation failed: expected object".to_string());
            };
            for field in required.iter().filter_map(Value::as_str) {
                if !input_object.contains_key(field) {
                    return Err(format!(
                        "Input schema validation failed: missing required property '{}'",
                        field
                    ));
                }
            }
        }
    }
    Ok(())
}

pub(super) fn string_array_field(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn matches_json_schema_type(value: &Value, expected_type: &str) -> bool {
    match expected_type {
        "array" => value.is_array(),
        "boolean" => value.is_boolean(),
        "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
        "null" => value.is_null(),
        "number" => value.is_number(),
        "object" => value.is_object(),
        "string" => value.is_string(),
        _ => true,
    }
}

fn json_value_type(value: &Value) -> &'static str {
    match value {
        Value::Array(_) => "array",
        Value::Bool(_) => "boolean",
        Value::Null => "null",
        Value::Number(_) => "number",
        Value::Object(_) => "object",
        Value::String(_) => "string",
    }
}
