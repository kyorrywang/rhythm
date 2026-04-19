use std::collections::HashMap;
use std::path::Path;

use serde_json::Value;

#[path = "command_registry_support.rs"]
mod support;

use super::types::LoadedPlugin;
use support::{
    execute_llm_complete_command, execute_runtime_command, execute_tool_command,
    plugin_has_granted_permission, register_builtin_tool_commands, string_array_field,
    validate_permissions, validate_schema,
};

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
                execute_runtime_command(plugins, resolved, input, cwd).await
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

pub fn resolve_builtin_tool_alias(tool_name: &str) -> &str {
    support::resolve_builtin_tool_alias(tool_name)
}
