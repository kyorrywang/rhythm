use serde_json::Value;
use std::process::Stdio;
use std::time::Instant;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::{mpsc, oneshot};

use crate::app::commands::plugins::PluginCommandEvent;

pub fn rand_suffix() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| format!("{:06x}", (duration.as_nanos() & 0xFF_FFFF) as u64))
        .unwrap_or_else(|_| "000000".to_string())
}

pub fn is_shell_tool_command(resolved: &crate::runtime::extensions::ResolvedPluginCommand) -> bool {
    resolved
        .definition
        .tool
        .as_deref()
        .map(crate::runtime::extensions::resolve_builtin_tool_alias)
        == Some("shell")
}

pub async fn run_shell_stream_command(
    run_id: String,
    input: Value,
    cwd_path: &std::path::Path,
    on_event: Channel<PluginCommandEvent>,
    mut cancel_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    let command = input
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| "tool.shell requires a string 'command'".to_string())?
        .to_string();
    let timeout_ms = input.get("timeout_ms").and_then(Value::as_u64);
    let max_output_bytes = input
        .get("max_output_bytes")
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(256 * 1024);

    let mut child = if cfg!(target_os = "windows") {
        TokioCommand::new("cmd")
            .args(["/C", &command])
            .current_dir(cwd_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    } else {
        TokioCommand::new("sh")
            .args(["-c", &command])
            .current_dir(cwd_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
    }
    .map_err(|e| format!("Cannot start shell command: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Cannot capture shell stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Cannot capture shell stderr".to_string())?;

    let (line_tx, mut line_rx) = mpsc::unbounded_channel::<(bool, String)>();
    spawn_reader(stdout, true, line_tx.clone());
    spawn_reader(stderr, false, line_tx);

    let started_at = Instant::now();
    let mut stdout_text = String::new();
    let mut stderr_text = String::new();
    let mut truncated = false;
    let mut timed_out = false;
    let mut timeout = timeout_ms
        .map(std::time::Duration::from_millis)
        .map(tokio::time::sleep)
        .map(Box::pin);

    loop {
        tokio::select! {
            _ = &mut cancel_rx => {
                let _ = child.kill().await;
                let _ = on_event.send(PluginCommandEvent::Cancelled { run_id });
                return Ok(());
            }
            _ = async {
                if let Some(timeout) = timeout.as_mut() {
                    timeout.as_mut().await;
                }
            }, if timeout.is_some() => {
                timed_out = true;
                let _ = child.kill().await;
            }
            Some((is_stdout, chunk)) = line_rx.recv() => {
                let total_len = stdout_text.len() + stderr_text.len();
                let target = if is_stdout { &mut stdout_text } else { &mut stderr_text };
                if !truncated {
                    let remaining = max_output_bytes.saturating_sub(total_len);
                    if remaining == 0 {
                        truncated = true;
                    } else {
                        let accepted = if chunk.len() > remaining {
                            truncated = true;
                            chunk[..remaining].to_string()
                        } else {
                            chunk.clone()
                        };
                        target.push_str(&accepted);
                    }
                }
                let _ = on_event.send(if is_stdout {
                    PluginCommandEvent::Stdout { run_id: run_id.clone(), chunk }
                } else {
                    PluginCommandEvent::Stderr { run_id: run_id.clone(), chunk }
                });
            }
            status = child.wait() => {
                let status = status.map_err(|e| format!("Shell command failed: {}", e))?;
                while let Ok((is_stdout, chunk)) = line_rx.try_recv() {
                    let total_len = stdout_text.len() + stderr_text.len();
                    let target = if is_stdout { &mut stdout_text } else { &mut stderr_text };
                    if !truncated {
                        let remaining = max_output_bytes.saturating_sub(total_len);
                        if remaining == 0 {
                            truncated = true;
                        } else {
                            let accepted = if chunk.len() > remaining {
                                truncated = true;
                                chunk[..remaining].to_string()
                            } else {
                                chunk.clone()
                            };
                            target.push_str(&accepted);
                        }
                    }
                    let _ = on_event.send(if is_stdout {
                        PluginCommandEvent::Stdout { run_id: run_id.clone(), chunk }
                    } else {
                        PluginCommandEvent::Stderr { run_id: run_id.clone(), chunk }
                    });
                }
                let exit_code = if timed_out { -1 } else { status.code().unwrap_or(-1) };
                let success = !timed_out && status.success();
                let result = serde_json::json!({
                    "command": command,
                    "stdout": stdout_text,
                    "stderr": stderr_text,
                    "exit_code": exit_code,
                    "success": success,
                    "timed_out": timed_out,
                    "truncated": truncated,
                    "duration_ms": started_at.elapsed().as_millis() as u64,
                });
                let _ = on_event.send(PluginCommandEvent::Completed { run_id, result });
                return Ok(());
            }
        }
    }
}

fn spawn_reader<R>(reader: R, is_stdout: bool, tx: mpsc::UnboundedSender<(bool, String)>)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx.send((is_stdout, format!("{}\n", line)));
        }
    });
}
