use std::process::{Command, Stdio};
use std::time::Duration;
use serde_json::Value;
use fnmatch_regex::glob_to_regex;
use crate::infrastructure::config::{HookConfig, CommandHookConfig, HttpHookConfig};
use super::events::HookEvent;
use super::loader::HookRegistry;
use super::types::{HookResult, AggregatedHookResult};

pub struct HookExecutor {
    registry: HookRegistry,
}

impl HookExecutor {
    pub fn new(registry: HookRegistry) -> Self {
        Self { registry }
    }

    /// Execute all hooks registered for `event` whose matcher matches the payload.
    pub async fn execute(&self, event: HookEvent, payload: &Value) -> AggregatedHookResult {
        let hooks = self.registry.get(&event);
        let event_str = event.as_str();
        let mut results = Vec::new();

        for hook in hooks {
            if !matches_hook(hook, payload) {
                continue;
            }
            let result = match hook {
                HookConfig::Command(cmd) => run_command_hook(cmd, event_str, payload).await,
                HookConfig::Http(http) => run_http_hook(http, event_str, payload).await,
            };
            results.push(result);
        }

        AggregatedHookResult { results }
    }
}

// ─── Matcher ─────────────────────────────────────────────────────────────────

fn matches_hook(hook: &HookConfig, payload: &Value) -> bool {
    let matcher = match hook {
        HookConfig::Command(c) => c.matcher.as_deref(),
        HookConfig::Http(h) => h.matcher.as_deref(),
    };
    let matcher = match matcher {
        Some(m) => m,
        None => return true,
    };
    let subject = payload.get("tool_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if let Ok(re) = glob_to_regex(matcher) {
        re.is_match(subject)
    } else {
        subject == matcher
    }
}

// ─── Command hook ─────────────────────────────────────────────────────────────

async fn run_command_hook(
    hook: &CommandHookConfig,
    event: &str,
    payload: &Value,
) -> HookResult {
    let payload_str = serde_json::to_string(payload).unwrap_or_default();
    let command = hook.command.replace("$ARGUMENTS", &payload_str);
    let timeout_secs = hook.timeout_secs;
    let event = event.to_string();

    let output_result = tokio::time::timeout(
        Duration::from_secs(timeout_secs),
        tokio::task::spawn_blocking(move || {
            if cfg!(target_os = "windows") {
                Command::new("cmd").args(&["/C", &command])
                    .env("RHYTHM_HOOK_EVENT", &event)
                    .env("RHYTHM_HOOK_PAYLOAD", &payload_str)
                    .stdout(Stdio::piped()).stderr(Stdio::piped())
                    .output()
            } else {
                Command::new("sh").args(&["-c", &command])
                    .env("RHYTHM_HOOK_EVENT", &event)
                    .env("RHYTHM_HOOK_PAYLOAD", &payload_str)
                    .stdout(Stdio::piped()).stderr(Stdio::piped())
                    .output()
            }
        }),
    ).await;

    match output_result {
        Ok(Ok(Ok(output))) => {
            let success = output.status.success();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let full_output = format!("{}{}", stdout, stderr);
            let blocked = !success && hook.block_on_failure;
            HookResult {
                hook_type: "command".to_string(),
                success,
                output: full_output.clone(),
                blocked,
                reason: if blocked { full_output } else { String::new() },
            }
        }
        _ => {
            let blocked = hook.block_on_failure;
            HookResult {
                hook_type: "command".to_string(),
                success: false,
                output: "Hook execution failed or timed out".to_string(),
                blocked,
                reason: if blocked { "Hook execution failed or timed out".to_string() } else { String::new() },
            }
        }
    }
}

// ─── HTTP hook ────────────────────────────────────────────────────────────────

async fn run_http_hook(
    hook: &HttpHookConfig,
    event: &str,
    payload: &Value,
) -> HookResult {
    let body = serde_json::json!({
        "event": event,
        "payload": payload,
    });
    let url = hook.url.clone();
    let timeout_secs = hook.timeout_secs;
    let headers = hook.headers.clone();
    let block_on_failure = hook.block_on_failure;

    let result = tokio::time::timeout(
        Duration::from_secs(timeout_secs),
        async move {
            let client = reqwest::Client::new();
            let mut req = client.post(&url).json(&body);
            for (k, v) in &headers {
                req = req.header(k, v);
            }
            req.send().await
        },
    ).await;

    match result {
        Ok(Ok(resp)) => {
            let success = resp.status().is_success();
            HookResult {
                hook_type: "http".to_string(),
                success,
                output: format!("HTTP {}", resp.status()),
                blocked: !success && block_on_failure,
                reason: if !success && block_on_failure {
                    format!("HTTP hook returned {}", resp.status())
                } else {
                    String::new()
                },
            }
        }
        _ => {
            HookResult {
                hook_type: "http".to_string(),
                success: false,
                output: "HTTP hook failed or timed out".to_string(),
                blocked: block_on_failure,
                reason: if block_on_failure { "HTTP hook failed or timed out".to_string() } else { String::new() },
            }
        }
    }
}
