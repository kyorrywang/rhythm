use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use crate::shared::schema::EventPayload;
use crate::infrastructure::event_bus;
use super::{BaseTool, ToolExecutionContext, ToolResult, context::resolve_and_validate_path};

pub struct WriteFileTool;

#[derive(Deserialize)]
struct WriteFileArgs {
    path: String,
    content: String,
}

#[async_trait]
impl BaseTool for WriteFileTool {
    fn name(&self) -> String { "write".to_string() }

    fn description(&self) -> String {
        "Create a new file or overwrite an existing file with the given content. \
         Parent directories are created automatically. Accepts absolute or cwd-relative paths.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to write to (absolute or relative to cwd)"
                },
                "content": {
                    "type": "string",
                    "description": "The content to write"
                }
            },
            "required": ["path", "content"]
        })
    }

    fn is_read_only(&self) -> bool { false }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: WriteFileArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };
        let path = match resolve_and_validate_path(&ctx.cwd, &args.path) {
            Ok(p) => p,
            Err(e) => return ToolResult::error(e),
        };
        if let Some(parent) = path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                return ToolResult::error(format!("Failed to create directory '{}': {}", parent.display(), e));
            }
        }
        if let Err(e) = fs::write(&path, &args.content) {
            return ToolResult::error(e.to_string());
        }
        event_bus::emit(&ctx.agent_id, &ctx.session_id, EventPayload::ToolOutput {
            tool_id: ctx.tool_call_id.clone(),
            log_line: format!("{} bytes written to {}", args.content.len(), path.display()),
        });
        ToolResult::ok(format!("Success: {} bytes written to {}", args.content.len(), path.display()))
    }
}
