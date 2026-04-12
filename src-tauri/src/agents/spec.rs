use crate::tools::{BaseTool, ToolExecutionContext, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

// Spec lifecycle bridge tools.
//
// These tools are part of the bundled `spec` primary agent design. They emit
// structured JSON that the frontend consumes to drive the Spec workbench.
// The backend itself does not scaffold `.spec/changes/<slug>/`; the frontend
// owns that workflow and may launch the bundled `spec-agent` subagent.

pub struct CreateSpecTool;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSpecArgs {
    title: String,
    goal: String,
    #[serde(default)]
    overview: Option<String>,
}

#[async_trait]
impl BaseTool for CreateSpecTool {
    fn name(&self) -> String {
        "create_spec".to_string()
    }

    fn description(&self) -> String {
        "Create a new Spec change task. \
         The frontend will scaffold proposal.md and tasks.md on disk and open the Spec workbench. \
         Provide a concise title and a clear goal statement. \
         Do NOT call start_spec immediately — wait for the user to confirm."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short, URL-safe title for the Spec (e.g. 'Add login rate limit')"
                },
                "goal": {
                    "type": "string",
                    "description": "One or two sentences describing what this change achieves"
                },
                "overview": {
                    "type": "string",
                    "description": "Optional longer description of scope, motivation, or approach"
                }
            },
            "required": ["title", "goal"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, args: Value, _ctx: &ToolExecutionContext) -> ToolResult {
        let args: CreateSpecArgs = match serde_json::from_value(args) {
            Ok(value) => value,
            Err(error) => return ToolResult::error(error.to_string()),
        };

        ToolResult::ok(
            serde_json::json!({
                "kind": "spec_tool_result",
                "action": "create_spec",
                "title": args.title,
                "goal": args.goal,
                "overview": args.overview.unwrap_or_default(),
            })
            .to_string(),
        )
    }
}

pub struct StartSpecTool;

#[derive(Debug, Deserialize)]
struct StartSpecArgs {
    slug: String,
}

#[async_trait]
impl BaseTool for StartSpecTool {
    fn name(&self) -> String {
        "start_spec".to_string()
    }

    fn description(&self) -> String {
        "Start executing a previously created Spec. \
         The frontend transitions the Spec state from 'draft' to 'active' and launches \
         the bundled spec-agent subagent to execute the tasks in tasks.md. \
         Only call this after the user has explicitly confirmed they want to start execution."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "slug": {
                    "type": "string",
                    "description": "The slug of the Spec to start (returned by create_spec)"
                }
            },
            "required": ["slug"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, args: Value, _ctx: &ToolExecutionContext) -> ToolResult {
        let args: StartSpecArgs = match serde_json::from_value(args) {
            Ok(value) => value,
            Err(error) => return ToolResult::error(error.to_string()),
        };

        ToolResult::ok(
            serde_json::json!({
                "kind": "spec_tool_result",
                "action": "start_spec",
                "slug": args.slug,
            })
            .to_string(),
        )
    }
}
