use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use crate::shared::schema::{EventPayload, AskQuestion};
use crate::infrastructure::event_bus;
use crate::runtime::ask;
use super::{BaseTool, ToolExecutionContext, ToolResult};
use tokio::sync::oneshot;

pub struct AskTool;

#[derive(Deserialize, Clone)]
struct AskQuestionArg {
    question: String,
    options: Option<Vec<String>>,
    #[serde(rename = "selectionType")]
    selection_type: Option<String>,
}

#[derive(Deserialize)]
struct AskArgs {
    questions: Option<Vec<AskQuestionArg>>,
    question: Option<String>,
    options: Option<Vec<String>>,
    #[serde(rename = "selectionType")]
    selection_type: Option<String>,
}

fn default_selection_type() -> String {
    "multiple_with_input".to_string()
}

fn parse_question(arg: &AskQuestionArg) -> AskQuestion {
    AskQuestion {
        question: arg.question.clone(),
        options: arg.options.clone().unwrap_or_default(),
        selection_type: arg.selection_type.clone().unwrap_or_else(default_selection_type),
    }
}

#[async_trait]
impl BaseTool for AskTool {
    fn name(&self) -> String { "ask_user".to_string() }

    fn description(&self) -> String {
        "Ask the user one or more questions and wait for their answers. \
         Use 'questions' for multiple questions, or 'question' for a single one.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "question": { "type": "string", "description": "A single question to ask" },
                "options": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Answer options (required at least one)"
                },
                "selectionType": {
                    "type": "string",
                    "enum": ["single_with_input", "multiple_with_input"],
                    "default": "multiple_with_input"
                },
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "question": { "type": "string" },
                            "options": { "type": "array", "items": { "type": "string" } },
                            "selectionType": { "type": "string" }
                        },
                        "required": ["question"]
                    },
                    "description": "Multiple questions. If provided, 'question'/'options'/'selectionType' are ignored."
                }
            },
            "required": []
        })
    }

    fn is_read_only(&self) -> bool { true }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: AskArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        let questions: Vec<AskQuestion> = if let Some(qs) = &args.questions {
            qs.iter().map(parse_question).collect()
        } else {
            let q = args.question.unwrap_or_default();
            if q.is_empty() {
                return ToolResult::error("No question provided");
            }
            vec![AskQuestion {
                question: q,
                options: args.options.clone().unwrap_or_default(),
                selection_type: args.selection_type.clone().unwrap_or_else(default_selection_type),
            }]
        };

        if questions.is_empty() {
            return ToolResult::error("No questions provided");
        }

        for q in &questions {
            if let Err(e) = q.validate() {
                return ToolResult::error(format!("Invalid question: {}", e));
            }
        }

        let (tx, rx) = oneshot::channel();
        ask::set_ask_waiter(ctx.tool_call_id.clone(), tx).await;

        let first = &questions[0];
        event_bus::emit(&ctx.agent_id, &ctx.session_id, EventPayload::AskRequest {
            tool_id: ctx.tool_call_id.clone(),
            question: first.question.clone(),
            options: first.options.clone(),
            selection_type: first.selection_type.clone(),
            questions: questions.clone(),
        });

        match rx.await {
            Ok(answer) => ToolResult::ok(answer),
            Err(_) => {
                // Clean up stale waiter on drop
                let _ = ask::remove_ask_waiter(&ctx.tool_call_id).await;
                ToolResult::error("Ask request was cancelled or dropped")
            }
        }
    }
}
