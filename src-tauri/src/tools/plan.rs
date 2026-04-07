use super::{BaseTool, ToolExecutionContext, ToolResult};
use crate::infrastructure::event_bus;
use crate::shared::schema::{EventPayload, Task};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

pub struct PlanTool;

#[derive(Deserialize)]
struct PlanArgs {
    tasks: Vec<Task>,
}

#[async_trait]
impl BaseTool for PlanTool {
    fn name(&self) -> String {
        "plan".to_string()
    }

    fn description(&self) -> String {
        "Create or update a task plan shown as a progress list to the user. \
         Call at the start of a complex task and update statuses as you progress."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "tasks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string" },
                            "text": { "type": "string" },
                            "status": {
                                "type": "string",
                                "enum": ["pending", "running", "completed", "error"]
                            }
                        },
                        "required": ["id", "text", "status"]
                    }
                }
            },
            "required": ["tasks"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: PlanArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };
        let task_count = args.tasks.len();
        let completed_count = args
            .tasks
            .iter()
            .filter(|t| t.status == "completed")
            .count();
        event_bus::emit(
            &ctx.agent_id,
            &ctx.session_id,
            EventPayload::TaskUpdate { tasks: args.tasks },
        );
        ToolResult::ok(format!(
            "Plan updated: {completed_count}/{task_count} tasks completed"
        ))
    }
}
