// 简化的 spec_tools - 只保留 create_spec
use super::{BaseTool, ToolExecutionContext, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;

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
        "创建一个新的 Spec 变更任务。需要提供标题和目标。".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "title": { "type": "string", "description": "Spec 标题" },
                "goal": { "type": "string", "description": "Spec 目标" },
                "overview": { "type": "string", "description": "概述（可选）" }
            },
            "required": ["title", "goal"]
        })
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
