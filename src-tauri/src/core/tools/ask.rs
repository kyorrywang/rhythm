use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use tauri::ipc::Channel;
use crate::shared::schema::ServerEventChunk;
use super::AgentTool;
use crate::core::state;
use tokio::sync::oneshot;

pub struct AskTool;

#[derive(Deserialize)]
struct AskArgs {
    question: String,
    options: Option<Vec<String>>,
}

#[async_trait]
impl AgentTool for AskTool {
    fn name(&self) -> &'static str {
        "ask_user"
    }

    fn description(&self) -> &'static str {
        "Ask the user a question and wait for their answer. Arguments: { \"question\": \"string\", \"options\": [\"string\"] }"
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The question to ask the user"
                },
                "options": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional list of answer options"
                }
            },
            "required": ["question"]
        })
    }

    async fn execute(&self, session_id: &str, tool_call_id: &str, args: Value, stream: &Channel<ServerEventChunk>) -> Result<String, String> {
        let args: AskArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;

        let (tx, rx) = oneshot::channel();
        state::set_ask_waiter(session_id.to_string(), tx).await;

        let _ = stream.send(ServerEventChunk::AskRequest {
            tool_id: tool_call_id.to_string(),
            question: args.question,
            options: args.options.unwrap_or_default(),
        });

        // Wait until user answers
        match rx.await {
            Ok(answer) => Ok(answer),
            Err(_) => Err("Ask request was cancelled or dropped".into()),
        }
    }
}
