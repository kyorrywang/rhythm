use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use tauri::ipc::Channel;
use crate::shared::schema::{ServerEventChunk, Task};
use super::AgentTool;

pub struct PlanTool;

#[derive(Deserialize)]
struct PlanArgs {
    tasks: Vec<Task>,
}

#[async_trait]
impl AgentTool for PlanTool {
    fn name(&self) -> &'static str {
        "plan"
    }

    fn description(&self) -> &'static str {
        "Create or update a task plan. Call this at the start of a complex task to show progress to the user, and update it as tasks are completed. Arguments: { \"tasks\": [{ \"id\": \"string\", \"text\": \"string\", \"status\": \"pending\" | \"running\" | \"completed\" | \"error\" }] }"
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
                            "id": {
                                "type": "string",
                                "description": "Unique identifier for the task"
                            },
                            "text": {
                                "type": "string",
                                "description": "Description of the task"
                            },
                            "status": {
                                "type": "string",
                                "enum": ["pending", "running", "completed", "error"],
                                "description": "Current status of the task"
                            }
                        },
                        "required": ["id", "text", "status"]
                    },
                    "description": "Full list of tasks (complete replacement, not incremental). Re-send the entire list with updated statuses each time."
                }
            },
            "required": ["tasks"]
        })
    }

    async fn execute(&self, _session_id: &str, _tool_call_id: &str, args: Value, stream: &Channel<ServerEventChunk>) -> Result<String, String> {
        let args: PlanArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;

        let task_count = args.tasks.len();
        let completed_count = args.tasks.iter().filter(|t| t.status == "completed").count();

        let _ = stream.send(ServerEventChunk::TaskUpdate {
            tasks: args.tasks,
        });

        Ok(format!("Plan updated: {completed_count}/{task_count} tasks completed"))
    }
}
