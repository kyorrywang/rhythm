use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::process::{Command as StdCommand, Stdio};
use crate::shared::schema::EventPayload;
use crate::core::event_bus;
use super::AgentTool;

pub struct ShellTool;

#[derive(Deserialize)]
struct ShellArgs {
    command: String,
}

#[async_trait]
impl AgentTool for ShellTool {
    fn name(&self) -> &'static str {
        "shell"
    }

    fn description(&self) -> &'static str {
        "Execute a shell command. Arguments: { \"command\": \"string\" }"
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

    async fn execute(&self, agent_id: &str, session_id: &str, tool_call_id: &str, args: Value) -> Result<String, String> {
        let args: ShellArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;
        let tool_id = tool_call_id;

        event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
            tool_id: tool_id.to_string(),
            log_line: format!("Executing: {}\n", args.command),
        });

        let output = if cfg!(target_os = "windows") {
            StdCommand::new("cmd")
                .args(&["/C", &args.command])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .map_err(|e| e.to_string())?
        } else {
            StdCommand::new("sh")
                .args(&["-c", &args.command])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .map_err(|e| e.to_string())?
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !stdout.is_empty() {
            event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
                tool_id: tool_id.to_string(),
                log_line: stdout.clone(),
            });
        }
        if !stderr.is_empty() {
            event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
                tool_id: tool_id.to_string(),
                log_line: stderr.clone(),
            });
        }

        if output.status.success() {
            Ok(stdout)
        } else {
            Err(format!("Error: {}, Exit code: {}", stderr, output.status.code().unwrap_or(-1)))
        }
    }
}
