use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;

use async_trait::async_trait;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

use super::types::LoadedPlugin;
use crate::runtime::capabilities::slash::host_api::{handle_runtime_rpc, PluginRuntimeHost};
use crate::runtime::capabilities::tools::{BaseTool, ToolExecutionContext, ToolResult};

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
    plugins: Vec<LoadedPlugin>,
}

impl PluginToolAdapter {
    pub fn from_manifest(
        plugin_name: &str,
        plugin_root: PathBuf,
        declaration: &Value,
        plugins: &[LoadedPlugin],
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
                .or_else(|| declaration.get("runtime"))
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
            plugins: plugins.to_vec(),
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
                        plugin_storage_path: crate::infra::paths::get_workspace_plugin_data_dir(
                            &ctx.cwd,
                            &self.plugin_name,
                        )
                        .to_string_lossy()
                        .to_string(),
                    },
                };
                match run_plugin_runtime(
                    self.implementation.as_deref().unwrap_or_default(),
                    &self.plugin_root,
                    entry,
                    handler,
                    &call,
                    Some(PluginRuntimeHost {
                        plugins: &self.plugins,
                        caller_plugin: &self.plugin_name,
                        cwd: &ctx.cwd,
                        plugin_storage_path: crate::infra::paths::get_workspace_plugin_data_dir(
                            &ctx.cwd,
                            &self.plugin_name,
                        )
                        .to_string_lossy()
                        .to_string(),
                        session_id: Some(&ctx.session_id),
                        agent_id: Some(&ctx.agent_id),
                        definition_id: ctx.metadata.get("agent_id").and_then(Value::as_str),
                        provider_id: ctx.metadata.get("provider_id").and_then(Value::as_str),
                        model: ctx.metadata.get("model").and_then(Value::as_str),
                        reasoning: ctx.metadata.get("reasoning").and_then(Value::as_str),
                    }),
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
    pub plugin_storage_path: String,
}

pub async fn run_plugin_runtime(
    implementation: &str,
    plugin_root: &std::path::Path,
    entry: &str,
    handler: &str,
    call: &PluginRuntimeCall,
    host: Option<PluginRuntimeHost<'_>>,
) -> Result<Value, String> {
    let executable = match implementation {
        "node" => "node",
        "python" => "python",
        other => return Err(format!("Unsupported plugin runtime '{}'", other)),
    };
    let entry_path = crate::runtime::capabilities::tools::context::resolve_and_validate_path(
        &plugin_root.to_path_buf(),
        entry,
    )?;
    let process_plugin_root = normalize_process_path(plugin_root);
    let process_entry_path = normalize_process_path(&entry_path);
    let runtime_call = serde_json::to_string(call).map_err(|e| e.to_string())?;
    let mut child = tokio::process::Command::new(executable)
        .arg(&process_entry_path)
        .arg(handler)
        .current_dir(&process_plugin_root)
        .env("RHYTHM_PLUGIN_CALL", &runtime_call)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Cannot run plugin runtime '{}': {}", implementation, e))?;

    let mut child_stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Cannot open plugin runtime stdin".to_string())?;
    let child_stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Cannot open plugin runtime stdout".to_string())?;
    let mut child_stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Cannot open plugin runtime stderr".to_string())?;

    let stderr_task = tokio::spawn(async move {
        let mut stderr = String::new();
        let _ = child_stderr.read_to_string(&mut stderr).await;
        stderr
    });

    let mut final_stdout = String::new();
    let mut lines = BufReader::new(child_stdout).lines();
    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| format!("Cannot read plugin runtime stdout: {}", e))?
    {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
            if value.get("rpc").is_some() || value.get("method").is_some() {
                let response = handle_runtime_rpc(&value, host.as_ref()).await;
                let response_line = serde_json::to_string(&response).map_err(|e| e.to_string())?;
                child_stdin
                    .write_all(response_line.as_bytes())
                    .await
                    .map_err(|e| format!("Cannot write plugin runtime RPC response: {}", e))?;
                child_stdin
                    .write_all(b"\n")
                    .await
                    .map_err(|e| format!("Cannot write plugin runtime RPC response: {}", e))?;
                child_stdin
                    .flush()
                    .await
                    .map_err(|e| format!("Cannot flush plugin runtime RPC response: {}", e))?;
                continue;
            }
        }
        if !final_stdout.is_empty() {
            final_stdout.push('\n');
        }
        final_stdout.push_str(&line);
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Cannot wait for plugin runtime: {}", e))?;
    let stderr = stderr_task.await.unwrap_or_default();

    if !status.success() {
        return Err(format!(
            "Plugin runtime failed with exit code {}:\n{}",
            status.code().unwrap_or(-1),
            stderr
        ));
    }
    let stdout = final_stdout.trim().to_string();
    if stdout.is_empty() {
        return Ok(serde_json::json!({ "ok": true, "data": null }));
    }
    serde_json::from_str(&stdout)
        .map_err(|e| format!("Plugin runtime returned invalid JSON: {}", e))
}

fn normalize_process_path(path: &std::path::Path) -> std::path::PathBuf {
    #[cfg(windows)]
    {
        use std::path::PathBuf;

        let value = path.to_string_lossy();
        if let Some(stripped) = value.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
        path.to_path_buf()
    }

    #[cfg(not(windows))]
    {
        path.to_path_buf()
    }
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
