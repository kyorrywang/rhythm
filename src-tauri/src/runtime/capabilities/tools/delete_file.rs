use super::{context::resolve_and_validate_path, BaseTool, ToolExecutionContext, ToolResult};
use crate::infra::event_bus;
use crate::shared::schema::EventPayload;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;

pub struct DeleteFileTool;

#[derive(Deserialize)]
struct DeleteFileArgs {
    path: String,
}

#[async_trait]
impl BaseTool for DeleteFileTool {
    fn name(&self) -> String {
        "delete".to_string()
    }

    fn description(&self) -> String {
        "Delete a file. This action cannot be undone.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to delete"
                }
            },
            "required": ["path"]
        })
    }

    fn is_read_only(&self) -> bool {
        false
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: DeleteFileArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };
        let path = match resolve_and_validate_path(&ctx.cwd, &args.path) {
            Ok(p) => p,
            Err(e) => return ToolResult::error(e),
        };
        if let Err(e) = fs::remove_file(&path) {
            return ToolResult::error(e.to_string());
        }
        event_bus::emit(
            &ctx.agent_id,
            &ctx.session_id,
            EventPayload::ToolOutput {
                tool_id: ctx.tool_call_id.clone(),
                log_line: format!("Deleted {}", path.display()),
            },
        );
        ToolResult::ok(format!("Success: {} deleted", path.display()))
    }
}
