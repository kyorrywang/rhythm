use std::collections::HashMap;
use std::path::PathBuf;

use async_trait::async_trait;
use serde_json::Value;

use crate::tools::{BaseTool, ToolExecutionContext, ToolResult};

#[derive(Clone)]
pub struct PluginToolAdapter {
    plugin_name: String,
    tool_id: String,
    description: String,
    parameters: Value,
    read_only: bool,
    command_id: String,
    plugin_root: PathBuf,
    implementation: Option<String>,
    entry: Option<String>,
    handler: Option<String>,
}

impl PluginToolAdapter {
    pub fn from_manifest(
        plugin_name: &str,
        plugin_root: PathBuf,
        declaration: &Value,
    ) -> Option<Self> {
        let tool_id = declaration.get("id")?.as_str()?.to_string();
        Some(Self {
            plugin_name: plugin_name.to_string(),
            command_id: declaration
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or(&tool_id)
                .to_string(),
            tool_id,
            description: declaration
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("Plugin tool")
                .to_string(),
            parameters: declaration
                .get("parameters")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({ "type": "object" })),
            read_only: declaration
                .get("readOnly")
                .or_else(|| declaration.get("read_only"))
                .and_then(Value::as_bool)
                .unwrap_or(false),
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
            plugin_root,
        })
    }
}

#[async_trait]
impl BaseTool for PluginToolAdapter {
    fn name(&self) -> String {
        self.tool_id.clone()
    }

    fn description(&self) -> String {
        self.description.clone()
    }

    fn parameters(&self) -> Value {
        self.parameters.clone()
    }

    fn is_read_only(&self) -> bool {
        self.read_only
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        match self.implementation.as_deref() {
            Some("node") | Some("python") => {
                let Some(entry) = &self.entry else {
                    return ToolResult::error(format!(
                        "Plugin tool '{}' is missing entry",
                        self.tool_id
                    ));
                };
                let Some(handler) = &self.handler else {
                    return ToolResult::error(format!(
                        "Plugin tool '{}' is missing handler",
                        self.tool_id
                    ));
                };
                let call = PluginRuntimeCall {
                    id: ctx.tool_call_id.clone(),
                    plugin: self.plugin_name.clone(),
                    command: self.command_id.clone(),
                    kind: "tool".to_string(),
                    input: args,
                    context: PluginRuntimeCallContext {
                        cwd: ctx.cwd.to_string_lossy().to_string(),
                        session_id: Some(ctx.session_id.clone()),
                        tool_call_id: Some(ctx.tool_call_id.clone()),
                    },
                };
                match run_plugin_runtime(
                    self.implementation.as_deref().unwrap_or_default(),
                    &self.plugin_root,
                    entry,
                    handler,
                    &call,
                )
                .await
                {
                    Ok(value) => runtime_value_to_tool_result(value),
                    Err(error) => ToolResult::error(error),
                }
            }
            Some(other) => ToolResult::error(format!(
                "Plugin tool '{}' uses unsupported implementation '{}'",
                self.tool_id, other
            )),
            None => ToolResult::error(format!(
                "Plugin tool '{}' is declared but has no implementation",
                self.tool_id
            )),
        }
    }
}

#[derive(serde::Serialize)]
pub struct PluginRuntimeCall {
    pub id: String,
    pub plugin: String,
    pub command: String,
    pub kind: String,
    pub input: Value,
    pub context: PluginRuntimeCallContext,
}

#[derive(serde::Serialize)]
pub struct PluginRuntimeCallContext {
    pub cwd: String,
    pub session_id: Option<String>,
    pub tool_call_id: Option<String>,
}

pub async fn run_plugin_runtime(
    implementation: &str,
    plugin_root: &std::path::Path,
    entry: &str,
    handler: &str,
    call: &PluginRuntimeCall,
) -> Result<Value, String> {
    let executable = match implementation {
        "node" => "node",
        "python" => "python",
        other => return Err(format!("Unsupported plugin runtime '{}'", other)),
    };
    let entry_path =
        crate::tools::context::resolve_and_validate_path(&plugin_root.to_path_buf(), entry)?;
    let stdin = serde_json::to_string(call).map_err(|e| e.to_string())?;
    let output = tokio::process::Command::new(executable)
        .arg(entry_path)
        .arg(handler)
        .current_dir(plugin_root)
        .env("RHYTHM_PLUGIN_CALL", &stdin)
        .output()
        .await
        .map_err(|e| format!("Cannot run plugin runtime '{}': {}", implementation, e))?;
    if !output.status.success() {
        return Err(format!(
            "Plugin runtime failed with exit code {}:\n{}",
            output.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(serde_json::json!({ "ok": true, "data": null }));
    }
    serde_json::from_str(&stdout)
        .map_err(|e| format!("Plugin runtime returned invalid JSON: {}", e))
}

pub fn runtime_value_to_tool_result(value: Value) -> ToolResult {
    if value.get("ok").and_then(Value::as_bool) == Some(false) {
        let message = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("Plugin tool failed");
        return ToolResult::error(message.to_string());
    }
    if let Some(output) = value.get("output").and_then(Value::as_str) {
        return ToolResult::ok(output.to_string());
    }
    if let Some(data) = value.get("data") {
        return ToolResult::ok(match data {
            Value::String(text) => text.clone(),
            other => serde_json::to_string_pretty(other).unwrap_or_else(|_| other.to_string()),
        });
    }
    ToolResult::ok(serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string()))
}

pub fn runtime_metadata(
    implementation: Option<String>,
    entry: Option<String>,
    handler: Option<String>,
) -> HashMap<String, String> {
    let mut metadata = HashMap::new();
    if let Some(value) = implementation {
        metadata.insert("implementation".to_string(), value);
    }
    if let Some(value) = entry {
        metadata.insert("entry".to_string(), value);
    }
    if let Some(value) = handler {
        metadata.insert("handler".to_string(), value);
    }
    metadata
}
