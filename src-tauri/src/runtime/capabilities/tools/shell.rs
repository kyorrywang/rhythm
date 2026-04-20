use super::{BaseTool, ToolExecutionContext, ToolResult};
use crate::infra::event_bus;
use crate::runtime::conversation::interrupts;
use crate::shared::schema::EventPayload;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::{sleep, Duration};

pub struct ShellTool;

#[derive(Deserialize)]
struct ShellArgs {
    command: String,
}

#[async_trait]
impl BaseTool for ShellTool {
    fn name(&self) -> String {
        "shell".to_string()
    }

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

    fn is_read_only(&self) -> bool {
        false
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: ShellArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        event_bus::emit(
            &ctx.agent_id,
            &ctx.session_id,
            EventPayload::ToolOutput {
                tool_id: ctx.tool_call_id.clone(),
                log_line: format!("Executing: {}\n", args.command),
            },
        );

        let child = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .args(["/C", &args.command])
                .current_dir(&ctx.cwd)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true)
                .spawn()
        } else {
            Command::new("sh")
                .args(["-c", &args.command])
                .current_dir(&ctx.cwd)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true)
                .spawn()
        };

        let mut child = match child {
            Ok(o) => o,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        let stdout_handle = child.stdout.take();
        let stderr_handle = child.stderr.take();
        let stdout_task = tokio::spawn(async move {
            let mut stdout = stdout_handle;
            let mut buffer = Vec::new();
            if let Some(ref mut stream) = stdout {
                let _ = stream.read_to_end(&mut buffer).await;
            }
            buffer
        });
        let stderr_task = tokio::spawn(async move {
            let mut stderr = stderr_handle;
            let mut buffer = Vec::new();
            if let Some(ref mut stream) = stderr {
                let _ = stream.read_to_end(&mut buffer).await;
            }
            buffer
        });

        let status = tokio::select! {
            result = child.wait() => result,
            _ = wait_for_interrupt(&ctx.session_id) => {
                let _ = child.start_kill();
                let _ = child.wait().await;
                return ToolResult::error("Shell command interrupted");
            }
        };

        let status = match status {
            Err(e) => return ToolResult::error(e.to_string()),
            Ok(status) => status,
        };

        let stdout = match stdout_task.await {
            Ok(buffer) => String::from_utf8_lossy(&buffer).to_string(),
            Err(_) => String::new(),
        };
        let stderr = match stderr_task.await {
            Ok(buffer) => String::from_utf8_lossy(&buffer).to_string(),
            Err(_) => String::new(),
        };

        if !stdout.is_empty() {
            event_bus::emit(
                &ctx.agent_id,
                &ctx.session_id,
                EventPayload::ToolOutput {
                    tool_id: ctx.tool_call_id.clone(),
                    log_line: stdout.clone(),
                },
            );
        }
        if !stderr.is_empty() {
            event_bus::emit(
                &ctx.agent_id,
                &ctx.session_id,
                EventPayload::ToolOutput {
                    tool_id: ctx.tool_call_id.clone(),
                    log_line: stderr.clone(),
                },
            );
        }

        if status.success() {
            ToolResult::ok(stdout)
        } else {
            ToolResult::error(format!(
                "Exit code: {}\n{}",
                status.code().unwrap_or(-1),
                stderr
            ))
        }
    }
}

async fn wait_for_interrupt(session_id: &str) {
    loop {
        if interrupts::is_interrupted(session_id).await {
            return;
        }
        sleep(Duration::from_millis(50)).await;
    }
}
