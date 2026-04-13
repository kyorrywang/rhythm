use super::{BaseTool, ToolExecutionContext, ToolResult};
use super::plan_tasks::{PlanManifest, TaskStatus};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

pub struct GetPlanStatusTool;

#[derive(Deserialize)]
struct GetPlanStatusArgs {
    workspace_path: String,
}

#[async_trait]
impl BaseTool for GetPlanStatusTool {
    fn name(&self) -> String {
        "get_plan_status".to_string()
    }

    fn description(&self) -> String {
        "Read and return the current state of a plan from its plan.json manifest. \
         Useful for resuming after an interruption, verifying what tasks are pending, \
         or diagnosing a blocked plan. Returns the full task list with statuses and the \
         current list of tasks that are ready to start."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "workspace_path": {
                    "type": "string",
                    "description": "Absolute path to the plan workspace directory (the workspace_path returned by plan_tasks)."
                }
            },
            "required": ["workspace_path"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, args: Value, _ctx: &ToolExecutionContext) -> ToolResult {
        let args: GetPlanStatusArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        let workspace_path = Path::new(&args.workspace_path);
        let manifest = match PlanManifest::load(workspace_path) {
            Ok(m) => m,
            Err(e) => return ToolResult::error(e),
        };

        let (pending, done, failed) = manifest.status_counts();
        let total = manifest.tasks.len();

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

        let all_tasks: Vec<Value> = manifest
            .tasks
            .iter()
            .map(|t| {
                serde_json::json!({
                    "id": t.id,
                    "description": t.description,
                    "status": match t.status {
                        TaskStatus::Pending => "pending",
                        TaskStatus::Done    => "done",
                        TaskStatus::Failed  => "failed",
                    },
                    "output_path": t.output_path,
                    "depends_on": t.depends_on,
                })
            })
            .collect();

        let is_blocked = failed > 0 && pending > 0 && ready_tasks.is_empty();

        let result = serde_json::json!({
            "workspace": manifest.workspace,
            "workspace_path": manifest.workspace_path,
            "created_at": manifest.created_at,
            "progress": {
                "total": total,
                "done": done,
                "failed": failed,
                "pending": pending,
            },
            "all_complete": done == total,
            "is_blocked": is_blocked,
            "ready_tasks": ready_tasks,
            "all_tasks": all_tasks,
        });

        ToolResult::ok(result.to_string())
    }
}
