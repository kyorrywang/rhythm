use super::{BaseTool, ToolExecutionContext, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

pub struct PlanTasksTool;

#[derive(Deserialize)]
struct TaskDecl {
    id: String,
    description: String,
    #[serde(default)]
    depends_on: Vec<String>,
    output_file: String,
}

#[derive(Deserialize)]
struct PlanTasksArgs {
    workspace: String,
    tasks: Vec<TaskDecl>,
}

#[async_trait]
impl BaseTool for PlanTasksTool {
    fn name(&self) -> String {
        "plan_tasks".to_string()
    }

    fn description(&self) -> String {
        "Declare a complete execution plan. This creates a workspace directory and empty dummy files for intended outputs, and returns the path to the workspace and the tasks that are ready to start (have no dependencies). MUST be called before any subagents are spawned for complex tasks.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "workspace": {
                    "type": "string",
                    "description": "Name of the workspace folder to create for this task plan (will be created in current directory)"
                },
                "tasks": {
                    "type": "array",
                    "description": "List of all tasks in the plan",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "description": "Unique ID for this task (e.g. 'research_market')" },
                            "description": { "type": "string", "description": "What this task should do" },
                            "depends_on": { 
                                "type": "array", 
                                "items": { "type": "string" },
                                "description": "List of task IDs that must complete before this one can start"
                            },
                            "output_file": { "type": "string", "description": "Name of the file this task will produce (relative to workspace)" }
                        },
                        "required": ["id", "description", "output_file"]
                    }
                }
            },
            "required": ["workspace", "tasks"]
        })
    }

    fn is_read_only(&self) -> bool {
        // Since coordinate mode is often "plan" which locks it to read_only by default unless allowedTools bypasses it,
        // and we will add "plan_tasks" to allowed_tools, setting this to false correctly reflects the side effect.
        false
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: PlanTasksArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        if args.workspace.contains("..") || args.workspace.contains('/') || args.workspace.contains('\\') {
            return ToolResult::error("Workspace name must be a simple directory name, not a path".to_string());
        }

        let tasks_dir = ctx.cwd.join(".rhythm").join("tasks");
        let workspace_path = tasks_dir.join(&args.workspace);
        
        if let Err(e) = std::fs::create_dir_all(&workspace_path) {
            return ToolResult::error(format!("Failed to create workspace directory: {}", e));
        }

        // Initialize empty output files
        for task in &args.tasks {
            if task.output_file.contains("..") || task.output_file.contains('/') || task.output_file.contains('\\') {
                 return ToolResult::error(format!("Output file name for task '{}' must be a simple file name", task.id));
            }
            let file_path = workspace_path.join(&task.output_file);
            if let Err(e) = std::fs::write(&file_path, "") {
                 return ToolResult::error(format!("Failed to create output file {}: {}", task.output_file, e));
            }
        }

        let ready_tasks: Vec<String> = args.tasks.iter()
            .filter(|t| t.depends_on.is_empty())
            .map(|t| t.id.clone())
            .collect();

        let result = serde_json::json!({
            "workspace_path": workspace_path.to_string_lossy().to_string(),
            "total_tasks": args.tasks.len(),
            "ready_tasks": ready_tasks,
            "message": "Plan accepted. Workspace initialized. You may now spawn subagents for the ready tasks, giving them the exact output_file paths."
        });

        ToolResult::ok(result.to_string())
    }
}
