use std::sync::Arc;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use crate::core::tool_use::registry::{ToolDefinition, ToolRegistry};

pub fn register_builtin_io(registry: &mut ToolRegistry) {
    // builtin.get_time
    registry.register(ToolDefinition {
        name: "builtin.get_time".to_string(),
        description: "获取当前本地时间".to_string(),
        parameters: json!({ "type": "object", "properties": {} }),
        handler: Arc::new(|_args| {
            Ok(json!(chrono::Local::now().to_rfc3339()))
        }),
    });

    // builtin.write_text_file
    registry.register(ToolDefinition {
        name: "builtin.write_text_file".to_string(),
        description: "将文本内容写入工作区的文件。建议文件名以 .md 结尾。".to_string(),
        parameters: json!({
            "type": "object",
            "properties": {
                "filename": { "type": "string" },
                "content": { "type": "string" }
            },
            "required": ["filename", "content"]
        }),
        handler: Arc::new(|args| {
            let filename = args.get("filename").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("Missing filename"))?;
            let content = args.get("content").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("Missing content"))?;
            let workspace_path = args.get("__workspace_path").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("Missing workspace path context"))?;
            
            let mut path = PathBuf::from(workspace_path);
            path.push(filename);
            
            fs::write(&path, content)?;
            Ok(json!(format!("Successfully written to {}", path.display())))
        }),
    });
}
