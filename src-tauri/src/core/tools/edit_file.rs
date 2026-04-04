use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use crate::shared::schema::EventPayload;
use crate::core::event_bus;
use super::AgentTool;

pub struct EditFileTool;

#[derive(Deserialize)]
struct EditFileArgs {
    path: String,
    search: String,
    replace: String,
}

#[async_trait]
impl AgentTool for EditFileTool {
    fn name(&self) -> &'static str {
        "edit"
    }

    fn description(&self) -> &'static str {
        "Edit a file by searching for a specific string and replacing it with another. \
         The search string must match exactly (case-sensitive). \
         For multiple edits, call this tool multiple times."
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
                    "description": "The exact string to search for (case-sensitive)"
                },
                "replace": {
                    "type": "string",
                    "description": "The string to replace the search string with"
                }
            },
            "required": ["path", "search", "replace"]
        })
    }

    async fn execute(&self, agent_id: &str, session_id: &str, tool_call_id: &str, args: Value) -> Result<String, String> {
        let args: EditFileArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;
        let path = PathBuf::from(&args.path);

        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

        if !content.contains(&args.search) {
            return Err(format!("Search string not found: \"{}\"", args.search));
        }

        let new_content = content.replacen(&args.search, &args.replace, 1);
        fs::write(&path, &new_content).map_err(|e| e.to_string())?;

        event_bus::emit(agent_id, session_id, EventPayload::ToolOutput {
            tool_id: tool_call_id.to_string(),
            log_line: format!("Replaced \"{}\" with \"{}\"", args.search, args.replace),
        });
        Ok(format!("Success: 1 occurrence replaced"))
    }
}
