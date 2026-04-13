use super::{BaseTool, ToolExecutionContext, ToolResult};
use super::plan_tasks::{PlanManifest, TaskStatus};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

pub struct CompleteTaskTool;

#[derive(Deserialize)]
struct CompleteTaskArgs {
    /// Absolute path to the workspace directory (returned by plan_tasks as `workspace_path`).
    workspace_path: String,
    /// ID of the task that just finished.
    task_id: String,
    /// "done" (default) or "failed".
    #[serde(default = "default_status")]
    status: String,
}

fn default_status() -> String {
    "done".to_string()
}

#[async_trait]
impl BaseTool for CompleteTaskTool {
    fn name(&self) -> String {
        "complete_task".to_string()
    }

    fn description(&self) -> String {
        "Mark a task in the active plan as done or failed, persist the updated plan.json, \
         and return the next wave of tasks that are now ready to start (all dependencies satisfied). \
         MUST be called after every subagent finishes so the Coordinator can advance the plan. \
         Returns an empty ready_tasks list when all tasks are done or the plan is blocked by failures."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "workspace_path": {
                    "type": "string",
                    "description": "Absolute path to the plan workspace directory. This is the workspace_path value returned by plan_tasks."
                },
                "task_id": {
                    "type": "string",
                    "description": "The id of the task that has just completed."
                },
                "status": {
                    "type": "string",
                    "enum": ["done", "failed"],
                    "description": "Outcome of the task. Use 'done' for successful completion, 'failed' if the subagent returned an error or unusable output. Defaults to 'done'."
                }
            },
            "required": ["workspace_path", "task_id"]
        })
    }

    fn is_read_only(&self) -> bool {
        false
    }

    async fn execute(&self, args: Value, _ctx: &ToolExecutionContext) -> ToolResult {
        let args: CompleteTaskArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        // ── Validate status string ────────────────────────────────────────────
        let new_status = match args.status.to_lowercase().as_str() {
            "done" => TaskStatus::Done,
            "failed" => TaskStatus::Failed,
            other => {
                return ToolResult::error(format!(
                    "Invalid status '{}'. Must be 'done' or 'failed'.",
                    other
                ))
            }
        };

        // ── Load manifest ─────────────────────────────────────────────────────
        let workspace_path = Path::new(&args.workspace_path);
        let mut manifest = match PlanManifest::load(workspace_path) {
            Ok(m) => m,
            Err(e) => return ToolResult::error(e),
        };

        // ── Find and update the task ──────────────────────────────────────────
        let task_entry = manifest.tasks.iter_mut().find(|t| t.id == args.task_id);
        match task_entry {
            None => {
                return ToolResult::error(format!(
                    "Task '{}' not found in plan at '{}'.",
                    args.task_id, args.workspace_path
                ))
            }
            Some(task) => {
                if task.status != TaskStatus::Pending {
                    return ToolResult::error(format!(
                        "Task '{}' is already '{}' and cannot be updated again.",
                        args.task_id,
                        match task.status {
                            TaskStatus::Done => "done",
                            TaskStatus::Failed => "failed",
                            TaskStatus::Pending => "pending",
                        }
                    ));
                }
                task.status = new_status;
            }
        }

        // ── Persist updated manifest ──────────────────────────────────────────
        if let Err(e) = manifest.save(workspace_path) {
            return ToolResult::error(e);
        }

        // ── Compute overall progress ──────────────────────────────────────────
        let (pending, done, failed) = manifest.status_counts();
        let total = manifest.tasks.len();
        let all_done = done == total;
        let is_blocked = failed > 0 && pending > 0 && manifest.ready_tasks().is_empty();

        // ── Compute next ready wave ───────────────────────────────────────────
        let ready_tasks: Vec<Value> = manifest
            .ready_tasks()
            .iter()
            .map(|t| {
                serde_json::json!({
                    "id": t.id,
                    "description": t.description,
                    "output_path": t.output_path,
                })
            })
            .collect();

        // ── Compose result ────────────────────────────────────────────────────
        let message = if all_done {
            "All tasks complete. Proceed to synthesis.".to_string()
        } else if is_blocked {
            format!(
                "Plan is blocked: {} task(s) failed and {} pending task(s) cannot proceed. \
                 Review failed tasks and decide whether to retry or synthesise partial results.",
                failed, pending
            )
        } else {
            format!(
                "Task '{}' marked {}. {} ready, {} done, {} failed of {} total.",
                args.task_id,
                args.status,
                ready_tasks.len(),
                done,
                failed,
                total
            )
        };

        let result = serde_json::json!({
            "task_id": args.task_id,
            "updated_status": args.status,
            "ready_tasks": ready_tasks,
            "progress": {
                "total": total,
                "done": done,
                "failed": failed,
                "pending": pending,
            },
            "all_complete": all_done,
            "is_blocked": is_blocked,
            "message": message,
        });

        ToolResult::ok(result.to_string())
    }
}
