use super::{context::{emit_tool_output, resolve_and_validate_path}, BaseTool, ToolExecutionContext, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::fs::File;
use std::io::Write;

const EDIT_PROGRESS_CHUNK_BYTES: usize = 16 * 1024;

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
        emit_tool_output(ctx, format!("Resolving target path '{}'", args.path));
        let path = match resolve_and_validate_path(&ctx.cwd, &args.path) {
            Ok(p) => p,
            Err(e) => return ToolResult::error(e),
        };
        emit_tool_output(ctx, format!("Reading {}", path.display()));
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => return ToolResult::error(e.to_string()),
        };
        emit_tool_output(ctx, format!("Read {} characters", content.chars().count()));
        if !content.contains(&args.search) {
            return ToolResult::error(format!("Search string not found in {}", path.display()));
        }
        emit_tool_output(ctx, "Applying replacement");
        let new_content = content.replacen(&args.search, &args.replace, 1);
        emit_tool_output(ctx, format!("Opening {} for rewrite", path.display()));
        let mut file = match File::create(&path) {
            Ok(file) => file,
            Err(e) => return ToolResult::error(e.to_string()),
        };
        let bytes = new_content.as_bytes();
        let total_chunks = bytes.len().max(1).div_ceil(EDIT_PROGRESS_CHUNK_BYTES);
        emit_tool_output(
            ctx,
            format!("Writing updated content in {} chunk(s)", total_chunks),
        );
        for (index, chunk) in bytes.chunks(EDIT_PROGRESS_CHUNK_BYTES).enumerate() {
            if let Err(e) = file.write_all(chunk) {
                return ToolResult::error(e.to_string());
            }
            emit_tool_output(
                ctx,
                format!(
                    "Wrote chunk {}/{} ({} bytes)",
                    index + 1,
                    total_chunks,
                    chunk.len()
                ),
            );
        }
        if let Err(e) = file.flush() {
            return ToolResult::error(e.to_string());
        }
        emit_tool_output(ctx, format!("Replaced 1 occurrence in {}", path.display()));
        ToolResult::ok("Success: 1 occurrence replaced")
    }
}
