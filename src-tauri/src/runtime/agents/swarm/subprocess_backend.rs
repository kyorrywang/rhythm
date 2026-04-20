use std::collections::HashMap;
use tokio::sync::Mutex;

use super::types::{BackendType, SpawnResult, TeammateMessage, TeammateSpawnConfig};

// ─── SubprocessBackend ────────────────────────────────────────────────────────

/// Spawn Worker Agents as separate OS processes running Rhythm in headless mode.
/// The subprocess communicates via the event bus as a normal session.
pub struct SubprocessBackend {
    /// Maps `agent_id` → `task_id` (process handle key).
    agent_tasks: Mutex<HashMap<String, tokio::process::Child>>,
}

impl SubprocessBackend {
    pub fn new() -> Self {
        Self {
            agent_tasks: Mutex::new(HashMap::new()),
        }
    }

    /// Spawn a Worker in a subprocess.
    ///
    /// The subprocess is launched with the following environment variables set
    /// so the child can detect it is a Worker:
    /// - `RHYTHM_AGENT_ID` = `{name}@{team}`
    /// - `RHYTHM_TEAM_NAME` = `{team}`
    /// - `RHYTHM_SESSION_ID` = session id
    /// - `RHYTHM_PARENT_SESSION_ID` = parent session id
    pub async fn spawn(&self, config: TeammateSpawnConfig) -> SpawnResult {
        let agent_id = format!("{}@{}", config.name, config.team);
        let task_id = format!("sub-{}", &agent_id);
        let session_id = config
            .session_id
            .clone()
            .unwrap_or_else(|| format!("{}-sub", agent_id));

        // Build inherited environment
        let mut env_vars: HashMap<String, String> = std::env::vars().collect();
        env_vars.insert("RHYTHM_AGENT_ID".to_string(), agent_id.clone());
        env_vars.insert("RHYTHM_TEAM_NAME".to_string(), config.team.clone());
        env_vars.insert("RHYTHM_SESSION_ID".to_string(), session_id.clone());
        env_vars.insert(
            "RHYTHM_PARENT_SESSION_ID".to_string(),
            config.parent_session_id.clone(),
        );
        if let Some(model) = &config.model {
            env_vars.insert("RHYTHM_MODEL_OVERRIDE".to_string(), model.clone());
        }
        if let Some(permission_mode) = &config.permission_mode {
            env_vars.insert(
                "RHYTHM_PERMISSION_MODE_OVERRIDE".to_string(),
                serde_json::to_string(permission_mode)
                    .unwrap_or_else(|_| "\"default\"".to_string())
                    .trim_matches('"')
                    .to_string(),
            );
        }
        if let Some(agent_definition_id) = &config.agent_definition_id {
            env_vars.insert(
                "RHYTHM_AGENT_DEFINITION_ID".to_string(),
                agent_definition_id.clone(),
            );
        }
        if let Some(wt) = &config.worktree_path {
            env_vars.insert("RHYTHM_WORKTREE_PATH".to_string(), wt.clone());
        }

        // The current executable (rhythm) is reused with `--headless` flag.
        // If that flag doesn't exist yet the process will simply start normally;
        // the env vars are sufficient to configure Worker mode.
        let exe = std::env::current_exe().unwrap_or_else(|_| "rhythm".into());

        let mut cmd = tokio::process::Command::new(&exe);
        cmd.arg("--headless")
            .arg("--agent-id")
            .arg(&agent_id)
            .arg("--team")
            .arg(&config.team)
            .env_clear()
            .envs(&env_vars)
            .current_dir(&config.cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());

        match cmd.spawn() {
            Ok(mut child) => {
                // Send the initial prompt via stdin
                if let Some(stdin) = child.stdin.as_mut() {
                    use tokio::io::AsyncWriteExt;
                    let prompt_line = format!("{}\n", config.prompt);
                    let _ = stdin.write_all(prompt_line.as_bytes()).await;
                }
                self.agent_tasks
                    .lock()
                    .await
                    .insert(agent_id.clone(), child);
            }
            Err(e) => {
                eprintln!("[SubprocessBackend] failed to spawn {}: {}", agent_id, e);
            }
        }

        SpawnResult {
            task_id,
            agent_id,
            backend_type: BackendType::Subprocess,
        }
    }

    /// Write a message to the subprocess stdin.
    pub async fn send_message(&self, agent_id: &str, msg: TeammateMessage) {
        use tokio::io::AsyncWriteExt;
        let mut tasks = self.agent_tasks.lock().await;
        if let Some(child) = tasks.get_mut(agent_id) {
            if let Some(stdin) = child.stdin.as_mut() {
                let json = serde_json::json!({
                    "text": msg.text,
                    "from": msg.from_agent,
                    "summary": msg.summary,
                });
                let line = format!("{}\n", json);
                let _ = stdin.write_all(line.as_bytes()).await;
            }
        }
    }

    /// Terminate a Worker subprocess.
    pub async fn shutdown(&self, agent_id: &str, force: bool) {
        let mut tasks = self.agent_tasks.lock().await;
        if let Some(mut child) = tasks.remove(agent_id) {
            if force {
                let _ = child.kill().await;
            } else {
                // Send a graceful termination (SIGTERM on Unix); on Windows this
                // maps to TerminateProcess which is always forceful.
                #[cfg(unix)]
                {
                    use libc::SIGTERM;
                    use std::os::unix::process::CommandExt;
                    if let Some(pid) = child.id() {
                        unsafe { libc::kill(pid as i32, SIGTERM) };
                    }
                }
                #[cfg(not(unix))]
                {
                    let _ = child.kill().await;
                }
            }
        }
    }

    pub fn is_available(&self) -> bool {
        // Subprocess backend is always available.
        true
    }
}

impl Default for SubprocessBackend {
    fn default() -> Self {
        Self::new()
    }
}
