use chrono::Utc;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::cron::registry::SharedRegistry;
use crate::cron::types::CronRunStatus;
use crate::engine::{QueryContext, QueryEngine};
use crate::infrastructure::event_bus;
use crate::infrastructure::config;
use crate::hooks::executor::HookExecutor;
use crate::hooks::loader::load_hook_registry_for_cwd;
use crate::mcp::McpClientManager;
use crate::llm;
use crate::permissions::PermissionChecker;
use crate::prompts::build_runtime_prompt;
use crate::tools::ToolRegistry;

pub struct CronRunner {
    registry: SharedRegistry,
}

impl CronRunner {
    pub fn new(registry: SharedRegistry) -> Self {
        Self { registry }
    }

    pub async fn run(&self, job: &crate::cron::types::CronJob) {
        let start = std::time::Instant::now();
        let job_id = job.id.clone();
        let job_name = job.name.clone();

        event_bus::emit(
            "cron",
            &job_id,
            crate::shared::schema::EventPayload::CronJobTriggered {
                job_id: job_id.clone(),
                name: job_name.clone(),
            },
        );

        let (success, output) = if let Some(ref command) = job.command {
            self.run_command(command, &job.cwd).await
        } else if let Some(ref prompt) = job.prompt {
            self.run_prompt(prompt, &job.cwd).await
        } else {
            (false, "No command or prompt specified".to_string())
        };

        let duration_ms = start.elapsed().as_millis() as u64;
        let status = if success {
            CronRunStatus::Success
        } else {
            CronRunStatus::Failed {
                exit_code: 1,
                output: output.clone(),
            }
        };

        let now = Utc::now().timestamp_millis() as f64 / 1000.0;
        {
            let mut reg = self.registry.lock().unwrap();
            reg.update_after_run(&job_id, now, status.clone());
        }

        let output_short = if output.len() > 500 {
            format!("{}...(truncated)", &output[..500])
        } else {
            output.clone()
        };

        let job_id_clone = job_id.clone();
        event_bus::emit(
            "cron",
            &job_id_clone,
            crate::shared::schema::EventPayload::CronJobCompleted {
                job_id,
                name: job_name,
                success,
                output: output_short,
                duration_ms,
            },
        );
    }

    async fn run_command(&self, command: &str, cwd: &str) -> (bool, String) {
        if command.trim().is_empty() {
            return (false, "Empty command".to_string());
        }

        let mut cmd = if cfg!(windows) {
            let mut c = tokio::process::Command::new("cmd");
            c.args(["/C", command]);
            c
        } else {
            let mut c = tokio::process::Command::new("sh");
            c.args(["-c", command]);
            c
        };
        cmd.current_dir(cwd);

        match cmd.output().await {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let combined = if stderr.is_empty() {
                    stdout
                } else {
                    format!("{}\n{}", stdout, stderr)
                };
                (output.status.success(), combined)
            }
            Err(e) => (false, format!("Command execution failed: {}", e)),
        }
    }

    async fn run_prompt(&self, prompt: &str, cwd: &str) -> (bool, String) {
        let settings = config::load_settings();
        let cwd_path = PathBuf::from(cwd);
        let client = Arc::from(llm::create_client(&settings.llm));
        let system_prompt = build_runtime_prompt(&settings, &cwd_path, Some(prompt));

        let merged_mcp_configs = McpClientManager::merged_server_configs(&settings, &cwd_path);
        let mcp_manager = if merged_mcp_configs.is_empty() {
            None
        } else {
            let mut manager = McpClientManager::new(merged_mcp_configs);
            manager.connect_all().await;
            Some(Arc::new(Mutex::new(manager)))
        };

        let tool_registry = Arc::new(ToolRegistry::create_with_mcp(mcp_manager.clone()));
        let permission_checker = Arc::new(PermissionChecker::new(&settings.permission));
        let hook_registry = load_hook_registry_for_cwd(&settings, &cwd_path);
        let hook_executor = Arc::new(HookExecutor::new(hook_registry));

        let run_id = format!("cron-{}", uuid::Uuid::new_v4().simple());
        let context = QueryContext {
            api_client: client,
            tool_registry,
            permission_checker,
            hook_executor: Some(hook_executor),
            mcp_manager,
            cwd: cwd_path,
            model: settings.llm.model.clone(),
            system_prompt,
            agent_turn_limit: settings.agent_turn_limit,
            auto_compact_enabled: settings.auto_compact.enabled,
            max_tokens: settings.llm.max_tokens.unwrap_or(16384),
            auto_compact_threshold_ratio: settings.auto_compact.threshold_ratio,
            max_micro_compacts: settings.auto_compact.max_micro_compacts,
            agent_id: run_id.clone(),
            session_id: run_id,
        };

        let mut engine = QueryEngine::new(context);
        match engine.submit_message(prompt.to_string()).await {
            Ok(output) => (true, output),
            Err(e) => (false, format!("Prompt execution failed: {}", e)),
        }
    }
}
