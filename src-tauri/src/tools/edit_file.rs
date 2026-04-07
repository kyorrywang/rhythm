use super::{context::resolve_and_validate_path, BaseTool, ToolExecutionContext, ToolResult};
use crate::infrastructure::event_bus;
use crate::shared::schema::EventPayload;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;

pub struct EditFileTool;

#[derive(Deserialize)]
struct EditFileArgs {
    path: String,
    search: String,
    replace: String,
}

#[async_trait]
impl BaseTool for EditFileTool {
    fn name(&self) -> String {
        "edit".to_string()
    }

    fn description(&self) -> String {
        "Edit a file by finding an exact string and replacing it once (case-sensitive). \
         For multiple edits call this tool multiple times."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to edit"
                },
                "search": {
                    "type": "string",
                    "description": "Exact string to search for"
                },
                "replace": {
                    "type": "string",
                    "description": "Replacement string"
                }
            },
            "required": ["path", "search", "replace"]
        })
    }

    fn is_read_only(&self) -> bool {
        false
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: EditFileArgs = match serde_json::from_value(args) {
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
        if !content.contains(&args.search) {
            return ToolResult::error(format!("Search string not found in {}", path.display()));
        }
        let new_content = content.replacen(&args.search, &args.replace, 1);
        if let Err(e) = fs::write(&path, &new_content) {
            return ToolResult::error(e.to_string());
        }
        event_bus::emit(
            &ctx.agent_id,
            &ctx.session_id,
            EventPayload::ToolOutput {
                tool_id: ctx.tool_call_id.clone(),
                log_line: format!("Replaced 1 occurrence in {}", path.display()),
            },
        );
        ToolResult::ok("Success: 1 occurrence replaced")
    }
}
