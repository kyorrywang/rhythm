use super::{BaseTool, ToolExecutionContext, ToolResult};
use crate::infrastructure::event_bus;
use crate::runtime::ask;
use crate::shared::schema::{AskQuestion, EventPayload};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::oneshot;

pub struct AskTool;

#[derive(Deserialize, Clone)]
struct AskQuestionArg {
    question: String,
    options: Vec<String>,
    #[serde(rename = "selectionType")]
    selection_type: String,
}

#[derive(Deserialize)]
struct AskArgs {
    title: String,
    questions: Option<Vec<AskQuestionArg>>,
    question: Option<String>,
    options: Option<Vec<String>>,
    #[serde(rename = "selectionType")]
    selection_type: Option<String>,
}

fn parse_question(arg: &AskQuestionArg) -> AskQuestion {
    AskQuestion {
        question: arg.question.clone(),
        options: arg.options.clone(),
        selection_type: arg.selection_type.clone(),
    }
}

#[async_trait]
impl BaseTool for AskTool {
    fn name(&self) -> String {
        "ask_user".to_string()
    }

    fn description(&self) -> String {
        "Ask the user one or more questions and wait for their answers. \
         Use 'questions' for multiple questions, or 'question' for a single one."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "question": { "type": "string", "description": "A single question to ask" },
                "title": {
                    "type": "string",
                    "description": "A short title for this ask request, shown in the UI header"
                },
                "options": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 1,
                    "description": "Answer options (required at least one)"
                },
                "selectionType": {
                    "type": "string",
                    "enum": ["single_with_input", "multiple_with_input"]
                },
                "questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "question": { "type": "string" },
                            "options": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
                            "selectionType": {
                                "type": "string",
                                "enum": ["single_with_input", "multiple_with_input"]
                            }
                        },
                        "required": ["question", "options", "selectionType"]
                    },
                    "description": "Multiple questions. If provided, 'question'/'options'/'selectionType' are ignored."
                }
            },
            "required": ["title"],
            "oneOf": [
                { "required": ["question", "options", "selectionType"] },
                { "required": ["questions"] }
            ]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: AskArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        let questions: Vec<AskQuestion> = if let Some(qs) = &args.questions {
            qs.iter().map(parse_question).collect()
        } else {
            let q = match args.question.clone() {
                Some(question) => question,
                None => return ToolResult::error("No question provided"),
            };
            if q.is_empty() {
                return ToolResult::error("No question provided");
            }
            let options = match args.options.clone() {
                Some(options) => options,
                None => return ToolResult::error("Ask questions require options"),
            };
            let selection_type = match args.selection_type.clone() {
                Some(selection_type) => selection_type,
                None => return ToolResult::error("Ask questions require selectionType"),
            };
            vec![AskQuestion {
                question: q,
                options,
                selection_type,
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
        let title = args.title.trim().to_string();
        if title.is_empty() {
            return ToolResult::error("Ask requests require title");
        }

        event_bus::emit(
            &ctx.agent_id,
            &ctx.session_id,
            EventPayload::AskRequest {
                tool_id: ctx.tool_call_id.clone(),
                title,
                question: first.question.clone(),
                options: first.options.clone(),
                selection_type: first.selection_type.clone(),
                questions: questions.clone(),
            },
        );

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
