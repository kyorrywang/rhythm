use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::process::{Command as StdCommand, Stdio};
use crate::shared::schema::EventPayload;
use crate::infrastructure::event_bus;
use super::{BaseTool, ToolExecutionContext, ToolResult};

pub struct ShellTool;

#[derive(Deserialize)]
struct ShellArgs {
    command: String,
}

#[async_trait]
impl BaseTool for ShellTool {
    fn name(&self) -> String { "shell".to_string() }

    fn description(&self) -> String {
        "Execute a shell command and return its output.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute"
                }
            },
            "required": ["command"]
        })
    }

    fn is_read_only(&self) -> bool { false }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: ShellArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        event_bus::emit(&ctx.agent_id, &ctx.session_id, EventPayload::ToolOutput {
            tool_id: ctx.tool_call_id.clone(),
            log_line: format!("Executing: {}\n", args.command),
        });

        let output = if cfg!(target_os = "windows") {
            StdCommand::new("cmd")
                .args(&["/C", &args.command])
                .current_dir(&ctx.cwd)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
        } else {
            StdCommand::new("sh")
                .args(&["-c", &args.command])
                .current_dir(&ctx.cwd)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
        };

        let output = match output {
            Ok(o) => o,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !stdout.is_empty() {
            event_bus::emit(&ctx.agent_id, &ctx.session_id, EventPayload::ToolOutput {
                tool_id: ctx.tool_call_id.clone(),
                log_line: stdout.clone(),
            });
        }
        if !stderr.is_empty() {
            event_bus::emit(&ctx.agent_id, &ctx.session_id, EventPayload::ToolOutput {
                tool_id: ctx.tool_call_id.clone(),
                log_line: stderr.clone(),
            });
        }

        if output.status.success() {
            ToolResult::ok(stdout)
        } else {
            ToolResult::error(format!("Exit code: {}\n{}", output.status.code().unwrap_or(-1), stderr))
        }
    }
}
