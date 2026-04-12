use super::{BaseTool, ToolExecutionContext, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

fn ok_payload(action: &str, payload: Value) -> ToolResult {
    ToolResult::ok(
        serde_json::json!({
            "kind": "spec_tool_result",
            "action": action,
            "payload": payload,
        })
        .to_string(),
    )
}

pub struct CreateSpecTool;
pub struct UpdateSpecTool;
pub struct StartSpecTool;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSpecArgs {
    title: String,
    goal: String,
    #[serde(default)]
    overview: Option<String>,
    change: String,
    plan: String,
    tasks: String,
    #[serde(default)]
    open: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSpecArgs {
    #[serde(default)]
    slug: Option<String>,
    change: String,
    plan: String,
    tasks: String,
    #[serde(default)]
    open: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartSpecArgs {
    #[serde(default)]
    slug: Option<String>,
    #[serde(default)]
    open: Option<String>,
}

#[async_trait]
impl BaseTool for CreateSpecTool {
    fn name(&self) -> String {
        "create_spec".to_string()
    }

    fn description(&self) -> String {
        "Create a new spec with change.md, plan.md, and tasks.md content. Use this instead of replying with raw planning content.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "title": { "type": "string" },
                "goal": { "type": "string" },
                "overview": { "type": "string" },
                "change": { "type": "string", "description": "Full markdown for change.md" },
                "plan": { "type": "string", "description": "Full markdown for plan.md" },
                "tasks": { "type": "string", "description": "Full markdown for tasks.md" },
                "open": { "type": "string", "enum": ["change", "plan", "tasks", "timeline"] }
            },
            "required": ["title", "goal", "change", "plan", "tasks"]
        })
    }

    async fn execute(&self, args: Value, _ctx: &ToolExecutionContext) -> ToolResult {
        let args: CreateSpecArgs = match serde_json::from_value(args) {
            Ok(value) => value,
            Err(error) => return ToolResult::error(error.to_string()),
        };

        ok_payload(
            "create_spec",
            serde_json::json!({
                "title": args.title,
                "goal": args.goal,
                "overview": args.overview.unwrap_or_default(),
                "documents": {
                    "change": args.change,
                    "plan": args.plan,
                    "tasks": args.tasks,
                },
                "open": args.open.unwrap_or_else(|| "change".to_string()),
            }),
        )
    }
}

#[async_trait]
impl BaseTool for UpdateSpecTool {
    fn name(&self) -> String {
        "update_spec".to_string()
    }

    fn description(&self) -> String {
        "Update the current spec or a specific slug with new change.md, plan.md, and tasks.md content.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "slug": { "type": "string" },
                "change": { "type": "string", "description": "Full markdown for change.md" },
                "plan": { "type": "string", "description": "Full markdown for plan.md" },
                "tasks": { "type": "string", "description": "Full markdown for tasks.md" },
                "open": { "type": "string", "enum": ["change", "plan", "tasks", "timeline"] }
            },
            "required": ["change", "plan", "tasks"]
        })
    }

    async fn execute(&self, args: Value, _ctx: &ToolExecutionContext) -> ToolResult {
        let args: UpdateSpecArgs = match serde_json::from_value(args) {
            Ok(value) => value,
            Err(error) => return ToolResult::error(error.to_string()),
        };

        ok_payload(
            "update_spec",
            serde_json::json!({
                "slug": args.slug,
                "documents": {
                    "change": args.change,
                    "plan": args.plan,
                    "tasks": args.tasks,
                },
                "open": args.open.unwrap_or_else(|| "change".to_string()),
            }),
        )
    }
}

#[async_trait]
impl BaseTool for StartSpecTool {
    fn name(&self) -> String {
        "start_spec".to_string()
    }

    fn description(&self) -> String {
        "Start the current spec or a specific spec slug.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "slug": { "type": "string" },
                "open": { "type": "string", "enum": ["change", "plan", "tasks", "timeline"] }
            }
        })
    }

    async fn execute(&self, args: Value, _ctx: &ToolExecutionContext) -> ToolResult {
        let args: StartSpecArgs = match serde_json::from_value(args) {
            Ok(value) => value,
            Err(error) => return ToolResult::error(error.to_string()),
        };

        ok_payload(
            "start_spec",
            serde_json::json!({
                "slug": args.slug,
                "open": args.open.unwrap_or_else(|| "tasks".to_string()),
            }),
        )
    }
}
