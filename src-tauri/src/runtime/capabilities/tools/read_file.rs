use super::{context::resolve_and_validate_path, BaseTool, ToolExecutionContext, ToolResult};
use crate::infra::event_bus;
use crate::shared::schema::EventPayload;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;

pub struct ReadFileTool;

#[derive(Deserialize)]
struct ReadFileArgs {
    path: String,
}

#[async_trait]
impl BaseTool for ReadFileTool {
    fn name(&self) -> String {
        "read".to_string()
    }

    fn description(&self) -> String {
        "Read the contents of a file. Accepts absolute or cwd-relative paths.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to read (absolute or relative to cwd)"
                }
            },
            "required": ["path"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: ReadFileArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };
        let path = match resolve_and_validate_path(&ctx.cwd, &args.path) {
            Ok(p) => p,
            Err(e) => return ToolResult::error(e),
        };
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => return ToolResult::error(e.to_string()),
        };
        event_bus::emit(
            &ctx.agent_id,
            &ctx.session_id,
            EventPayload::ToolOutput {
                tool_id: ctx.tool_call_id.clone(),
                log_line: format!("Read {} bytes from {}", content.len(), path.display()),
            },
        );
        ToolResult::ok(content)
    }
}
