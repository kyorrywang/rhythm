use super::{context::resolve_and_validate_path, BaseTool, ToolExecutionContext, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::Path;

pub struct ListDirTool;

#[derive(Deserialize)]
struct ListDirArgs {
    #[serde(default = "default_path")]
    path: String,
}

fn default_path() -> String {
    ".".to_string()
}

#[async_trait]
impl BaseTool for ListDirTool {
    fn name(&self) -> String {
        "list_dir".to_string()
    }

    fn description(&self) -> String {
        "List files and folders in a workspace directory. Accepts absolute or cwd-relative paths."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The directory path to list (absolute or relative to cwd)"
                }
            }
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: ListDirArgs = match serde_json::from_value(args) {
            Ok(args) => args,
            Err(error) => return ToolResult::error(error.to_string()),
        };
        let target = match resolve_and_validate_path(&ctx.cwd, &args.path) {
            Ok(path) => path,
            Err(error) => return ToolResult::error(error),
        };
        if !target.is_dir() {
            return ToolResult::error(format!("'{}' is not a directory", args.path));
        }

        let mut entries = match fs::read_dir(&target) {
            Ok(read_dir) => read_dir
                .filter_map(|entry| entry.ok())
                .filter_map(|entry| {
                    let metadata = entry.metadata().ok()?;
                    let path = entry.path();
                    Some(serde_json::json!({
                        "name": entry.file_name().to_string_lossy().to_string(),
                        "path": relative_path(&ctx.cwd, &path),
                        "kind": if metadata.is_dir() { "directory" } else { "file" },
                        "size": metadata.is_file().then_some(metadata.len()),
                    }))
                })
                .collect::<Vec<_>>(),
            Err(error) => return ToolResult::error(error.to_string()),
        };

        entries.sort_by(|a, b| {
            let a_kind = a.get("kind").and_then(Value::as_str).unwrap_or_default();
            let b_kind = b.get("kind").and_then(Value::as_str).unwrap_or_default();
            let a_name = a.get("name").and_then(Value::as_str).unwrap_or_default();
            let b_name = b.get("name").and_then(Value::as_str).unwrap_or_default();
            if a_kind != b_kind {
                if a_kind == "directory" {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                }
            } else {
                a_name.cmp(b_name)
            }
        });

        ToolResult::ok(
            serde_json::to_string(&serde_json::json!({
                "path": relative_path(&ctx.cwd, &target),
                "entries": entries,
            }))
            .unwrap_or_else(|_| "{\"entries\":[]}".to_string()),
        )
    }
}

fn relative_path(cwd: &Path, target: &Path) -> String {
    target
        .strip_prefix(cwd)
        .ok()
        .and_then(|path| {
            let value = path.to_string_lossy().replace('\\', "/");
            if value.is_empty() {
                None
            } else {
                Some(value)
            }
        })
        .unwrap_or_else(|| ".".to_string())
}
