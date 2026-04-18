use std::collections::HashMap;
use std::path::Path;

use serde_json::Value;

use super::tool_adapter::{run_plugin_runtime, PluginRuntimeCall, PluginRuntimeCallContext};
use super::types::LoadedPlugin;
use crate::domains::slash::host_api::PluginRuntimeHost;
use crate::domains::tools::{ToolExecutionContext, ToolRegistry};

#[derive(Debug, Clone)]
pub struct PluginCommandDefinition {
    pub id: String,
    pub plugin_name: String,
    pub tool: Option<String>,
    pub implementation: Option<String>,
    pub entry: Option<String>,
    pub handler: Option<String>,
    pub permissions: Vec<String>,
    pub parameters: Option<Value>,
    pub declaration: Value,
}

#[derive(Debug, Clone)]
pub struct ResolvedPluginCommand {
    pub caller_plugin: String,
    pub provider_plugin: String,
    pub definition: PluginCommandDefinition,
}

#[derive(Debug)]
pub struct PluginCommandExecution {
    pub plugin_name: String,
    pub command_id: String,
    pub handled: bool,
    pub result: Value,
}

pub struct PluginCommandRegistry {
    commands: HashMap<String, PluginCommandDefinition>,
}

impl PluginCommandRegistry {
    pub fn from_plugins(plugins: &[LoadedPlugin]) -> Self {
        let mut commands = HashMap::new();
        register_builtin_tool_commands(&mut commands);
        for plugin in plugins {
            if !plugin.is_runtime_active() {
                continue;
            }
            for declaration in &plugin.manifest.contributes.commands {
                let Some(id) = declaration.get("id").and_then(Value::as_str) else {
                    continue;
                };
                commands.insert(
                    id.to_string(),
                    PluginCommandDefinition {
                        id: id.to_string(),
                        plugin_name: plugin.name().to_string(),
                        tool: declaration
                            .get("tool")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        implementation: declaration
                            .get("implementation")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        entry: declaration
                            .get("entry")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        handler: declaration
                            .get("handler")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        permissions: string_array_field(declaration, "permissions"),
                        parameters: declaration.get("parameters").cloned(),
                        declaration: declaration.clone(),
                    },
                );
            }
        }
        Self { commands }
    }

    pub async fn execute(
        &self,
        plugins: &[LoadedPlugin],
        caller_plugin: &str,
        command_id: &str,
        input: Value,
        cwd: &Path,
    ) -> Result<PluginCommandExecution, String> {
        let resolved = self.resolve(plugins, caller_plugin, command_id, &input)?;
        self.execute_resolved(plugins, &resolved, input, cwd).await
    }

    pub fn resolve(
        &self,
        plugins: &[LoadedPlugin],
        caller_plugin: &str,
        command_id: &str,
        input: &Value,
    ) -> Result<ResolvedPluginCommand, String> {
        let command = self
            .commands
            .get(command_id)
            .ok_or_else(|| format!("Command '{}' is not registered", command_id))?
            .clone();
        let provider = plugins
            .iter()
            .find(|plugin| plugin.name() == command.plugin_name && plugin.is_active);
        let caller = plugins
            .iter()
            .find(|plugin| plugin.name() == caller_plugin && plugin.is_active)
            .ok_or_else(|| format!("Calling plugin '{}' is not installed", caller_plugin))?;

        if let Some(provider) = provider.filter(|provider| !provider.enabled) {
            return Err(provider.blocked_reason.clone().unwrap_or_else(|| {
                format!("Command provider '{}' is not enabled", provider.name())
            }));
        }
        if !caller.enabled {
            return Err(caller
                .blocked_reason
                .clone()
                .unwrap_or_else(|| format!("Calling plugin '{}' is not enabled", caller.name())));
        }
        let can_dynamic_invoke = plugin_has_granted_permission(caller, "plugin.command.invoke");
        if command.plugin_name != "core.tools"
            && provider
                .map(|provider| caller.name() != provider.name())
                .unwrap_or(command.plugin_name != "core.tools")
            && !can_dynamic_invoke
            && !caller
                .manifest
                .requires
                .commands
                .iter()
                .any(|required| required == command_id)
        {
            return Err(format!(
                "Plugin '{}' must declare requires.commands ['{}'] before calling it",
                caller.name(),
                command_id
            ));
        }

        validate_schema(command.parameters.as_ref(), input)?;
        if let Some(provider) = provider {
            validate_permissions(provider, &command.permissions)?;
        } else {
            validate_permissions(caller, &command.permissions)?;
        }

        Ok(ResolvedPluginCommand {
            caller_plugin: caller.name().to_string(),
            provider_plugin: command.plugin_name.clone(),
            definition: command,
        })
    }

    pub async fn execute_resolved(
        &self,
        plugins: &[LoadedPlugin],
        resolved: &ResolvedPluginCommand,
        input: Value,
        cwd: &Path,
    ) -> Result<PluginCommandExecution, String> {
        if let Some(tool) = &resolved.definition.tool {
            return execute_tool_command(
                plugins,
                &resolved.provider_plugin,
                &resolved.definition.id,
                tool,
                input,
                cwd,
            )
            .await;
        }

        if resolved.definition.id == "core.llm.complete" {
            return execute_llm_complete_command(&resolved.definition.id, input).await;
        }

        match resolved.definition.implementation.as_deref() {
            Some("ui") => Err(format!(
                "Command '{}' is implemented by UI but no UI handler was registered",
                resolved.definition.id
            )),
            Some("node") | Some("python") => {
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
            Some(other) => Err(format!(
                "Command '{}' uses unsupported implementation '{}'",
                resolved.definition.id, other
            )),
            None => Ok(PluginCommandExecution {
                plugin_name: resolved.provider_plugin.clone(),
                command_id: resolved.definition.id.clone(),
                handled: false,
                result: serde_json::json!({
                    "status": "registered",
                    "message": "Command is declared but has no implementation or tool mapping.",
                    "declaration": resolved.definition.declaration,
                    "input": input
                }),
            }),
        }
    }
}

fn plugin_has_granted_permission(plugin: &LoadedPlugin, permission: &str) -> bool {
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

async fn execute_tool_command(
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

fn register_builtin_tool_commands(commands: &mut HashMap<String, PluginCommandDefinition>) {
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

async fn execute_llm_complete_command(
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

pub fn resolve_builtin_tool_alias(tool_name: &str) -> &str {
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

fn validate_permissions(plugin: &LoadedPlugin, permissions: &[String]) -> Result<(), String> {
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

fn validate_schema(schema: Option<&Value>, input: &Value) -> Result<(), String> {
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

fn string_array_field(value: &Value, key: &str) -> Vec<String> {
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
