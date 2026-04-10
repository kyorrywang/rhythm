use super::{context::{emit_tool_output, resolve_and_validate_path}, BaseTool, ToolExecutionContext, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::fs::File;
use std::io::Write;

const WRITE_PROGRESS_CHUNK_BYTES: usize = 16 * 1024;

pub struct WriteFileTool;

#[derive(Deserialize)]
struct WriteFileArgs {
    path: String,
    content: String,
}

#[async_trait]
impl BaseTool for WriteFileTool {
    fn name(&self) -> String {
        "write".to_string()
    }

    fn description(&self) -> String {
        "Create a new file or overwrite an existing file with the given content. \
         Parent directories are created automatically. Accepts absolute or cwd-relative paths."
            .to_string()
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

    fn is_read_only(&self) -> bool {
        false
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: WriteFileArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };
        emit_tool_output(ctx, format!("Resolving target path '{}'", args.path));
        let path = match resolve_and_validate_path(&ctx.cwd, &args.path) {
            Ok(p) => p,
            Err(e) => return ToolResult::error(e),
        };
        if let Some(parent) = path.parent() {
            emit_tool_output(ctx, format!("Ensuring parent directory {}", parent.display()));
            if let Err(e) = fs::create_dir_all(parent) {
                return ToolResult::error(format!(
                    "Failed to create directory '{}': {}",
                    parent.display(),
                    e
                ));
            }
        }
        emit_tool_output(ctx, format!("Opening {} for writing", path.display()));
        let mut file = match File::create(&path) {
            Ok(file) => file,
            Err(e) => return ToolResult::error(e.to_string()),
        };
        let bytes = args.content.as_bytes();
        let total_chunks = bytes.len().max(1).div_ceil(WRITE_PROGRESS_CHUNK_BYTES);
        emit_tool_output(
            ctx,
            format!("Writing {} bytes in {} chunk(s)", bytes.len(), total_chunks),
        );
        for (index, chunk) in bytes.chunks(WRITE_PROGRESS_CHUNK_BYTES).enumerate() {
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
        emit_tool_output(ctx, format!("Completed write to {}", path.display()));
        ToolResult::ok(format!(
            "Success: {} bytes written to {}",
            args.content.len(),
            path.display()
        ))
    }
}
