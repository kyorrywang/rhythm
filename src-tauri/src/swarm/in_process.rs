use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::types::{BackendType, SpawnResult, TeammateMessage, TeammateSpawnConfig};
use crate::coordinator::{
    format_task_notification, get_builtin_agent, TaskNotification, TaskNotificationStatus,
};
use crate::engine::{QueryContext, QueryEngine};
use crate::hooks::executor::HookExecutor;
use crate::hooks::loader::load_hook_registry_for_cwd;
use crate::infrastructure::config;
use crate::infrastructure::event_bus;
use crate::llm;
use crate::mcp::McpClientManager;
use crate::permissions::PermissionChecker;
use crate::prompts::build_runtime_prompt;
use crate::shared::schema::EventPayload;
use crate::swarm::agent_registry;
use crate::tools::ToolRegistry;

// ─── Active entry ─────────────────────────────────────────────────────────────

struct TeammateEntry {
    task: tokio::task::JoinHandle<()>,
    /// Channel to send additional messages to the running agent.
    tx: tokio::sync::mpsc::Sender<TeammateMessage>,
}

// ─── InProcess backend ────────────────────────────────────────────────────────

/// Executes Worker Agents as Tokio tasks inside the current process.
/// Suitable for lightweight parallelism without the overhead of a subprocess.
pub struct InProcessBackend {
    active: Mutex<HashMap<String, TeammateEntry>>,
}

impl InProcessBackend {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(HashMap::new()),
        }
    }

    /// Spawn a new Worker Agent as a Tokio task.
    pub async fn spawn(&self, config: TeammateSpawnConfig) -> SpawnResult {
        let agent_id = format!("{}@{}", config.name, config.team);
        let task_id = format!("t-{}", &agent_id);

        let (tx, mut rx) = tokio::sync::mpsc::channel::<TeammateMessage>(32);

        let agent_id_clone = agent_id.clone();
        let task_id_for_task = task_id.clone();
        let config_clone = config.clone();

        let task = tokio::spawn(async move {
            let settings = config::load_settings();
            let client = Arc::from(llm::create_client(&settings.llm));
            let cwd = std::path::PathBuf::from(&config_clone.cwd);
            let agent_def = config_clone
                .subagent_type
                .as_deref()
                .and_then(get_builtin_agent);
            let system_prompt =
                build_runtime_prompt(&settings, &cwd, Some(&config_clone.prompt), false);
            let merged_mcp_configs = McpClientManager::merged_server_configs(&settings, &cwd);
            let mcp_manager = if merged_mcp_configs.is_empty() {
                None
            } else {
                let mut manager = McpClientManager::new(merged_mcp_configs);
                manager.connect_all().await;
                Some(Arc::new(Mutex::new(manager)))
            };
            let tool_registry = Arc::new(ToolRegistry::create_for_agent(
                mcp_manager.clone(),
                agent_def.as_ref().and_then(|a| a.tools.as_deref()),
                agent_def
                    .as_ref()
                    .and_then(|a| a.disallowed_tools.as_deref()),
            ));
            let permission_checker = Arc::new(PermissionChecker::new_with_mode(
                &settings.permission,
                config_clone
                    .permission_mode
                    .clone()
                    .or_else(|| agent_def.as_ref().and_then(|a| a.permission_mode.clone())),
            ));

            let hook_executor = load_hook_registry_for_cwd(&settings, &cwd);
            let hook_executor = Arc::new(HookExecutor::new(hook_executor));

            let sub_session_id = config_clone
                .session_id
                .clone()
                .unwrap_or_else(|| format!("{}-{}", config_clone.team, &agent_id_clone));

            // Register agent in the registry so events route correctly
            let registered_id = agent_registry::register_agent(sub_session_id.clone(), None, 1);

            let context = QueryContext {
                api_client: client,
                tool_registry,
                permission_checker,
                hook_executor: Some(hook_executor),
                mcp_manager,
                cwd,
                model: config_clone
                    .model
                    .clone()
                    .or_else(|| agent_def.as_ref().and_then(|a| a.model.clone()))
                    .unwrap_or_else(|| settings.llm.model.clone()),
                reasoning: None,
                system_prompt,
                agent_turn_limit: agent_def
                    .as_ref()
                    .and_then(|a| a.max_turns)
                    .or(settings.agent_turn_limit),
                auto_compact_enabled: settings.auto_compact.enabled,
                max_tokens: settings.llm.max_tokens.unwrap_or(16384),
                auto_compact_threshold_ratio: settings.auto_compact.threshold_ratio,
                max_micro_compacts: settings.auto_compact.max_micro_compacts,
                agent_id: registered_id.clone(),
                session_id: sub_session_id.clone(),
            };

            let mut engine = QueryEngine::new(context);

            // Initial task prompt
            let started_at = std::time::Instant::now();
            let (mut final_status, mut final_result) =
                match engine.submit_message(config_clone.prompt.clone()).await {
                    Ok(text) => (TaskNotificationStatus::Completed, text),
                    Err(e) => {
                        eprintln!("[InProcessBackend] agent {} error: {}", agent_id_clone, e);
                        event_bus::emit(
                            &registered_id,
                            &sub_session_id,
                            EventPayload::TextDelta {
                                content: format!("\n[Agent error: {}]", e),
                            },
                        );
                        (
                            TaskNotificationStatus::Failed,
                            format!("Agent error: {}", e),
                        )
                    }
                };

            while let Some(msg) = rx.recv().await {
                match engine.submit_message(msg.text).await {
                    Ok(text) => {
                        final_result = text;
                    }
                    Err(e) => {
                        final_status = TaskNotificationStatus::Failed;
                        final_result = format!("Agent error: {}", e);
                        eprintln!(
                            "[InProcessBackend] follow-up error for {}: {}",
                            agent_id_clone, e
                        );
                        event_bus::emit(
                            &registered_id,
                            &sub_session_id,
                            EventPayload::TextDelta {
                                content: format!("\n[Agent error: {}]", e),
                            },
                        );
                    }
                }
            }

            let usage = engine.total_usage().clone();
            let notification = TaskNotification {
                task_id: task_id_for_task.clone(),
                status: final_status,
                summary: config_clone.name.clone(),
                result: final_result.clone(),
                total_tokens: usage.input_tokens + usage.output_tokens,
                tool_uses: 0,
                duration_ms: started_at.elapsed().as_millis() as u64,
            };
            event_bus::emit(
                &registered_id,
                &sub_session_id,
                EventPayload::TextDelta {
                    content: format!("\n{}", format_task_notification(&notification)),
                },
            );

            event_bus::unregister(&registered_id);
            agent_registry::unregister_agent(&registered_id);
        });

        self.active
            .lock()
            .await
            .insert(agent_id.clone(), TeammateEntry { task, tx });

        SpawnResult {
            task_id,
            agent_id,
            backend_type: BackendType::InProcess,
        }
    }

    /// Send an additional message to a running Worker.
    pub async fn send_message(&self, agent_id: &str, message: TeammateMessage) {
        let active = self.active.lock().await;
        if let Some(entry) = active.get(agent_id) {
            let _ = entry.tx.send(message).await;
        }
    }

    /// Request graceful shutdown of a Worker; `force` aborts the task.
    pub async fn shutdown(&self, agent_id: &str, force: bool) {
        let mut active = self.active.lock().await;
        if let Some(entry) = active.remove(agent_id) {
            if force {
                entry.task.abort();
            }
            // In graceful mode, the running agent task will naturally finish
        }
    }
}

impl Default for InProcessBackend {
    fn default() -> Self {
        Self::new()
    }
}
