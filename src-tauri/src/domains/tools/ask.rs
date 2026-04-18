use super::{BaseTool, ToolExecutionContext, ToolResult};
use crate::domains::chat::ask;
use crate::platform::event_bus;
use crate::shared::schema::{AskQuestion, AskResponse, EventPayload};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::oneshot;
use tokio::time::{sleep, Duration};

pub struct AskTool;

#[derive(Deserialize, Clone)]
struct AskQuestionArg {
    id: Option<String>,
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
        id: arg.id.clone().unwrap_or_default(),
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
        match Self::execute_structured(args, ctx).await {
            Ok(answer) => ToolResult::ok(render_ask_response(&answer)),
            Err(error) => ToolResult::error(error),
        }
    }
}

impl AskTool {
    pub async fn execute_structured(
        args: Value,
        ctx: &ToolExecutionContext,
    ) -> Result<AskResponse, String> {
        let args: AskArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return Err(e.to_string()),
        };

        let questions: Vec<AskQuestion> = if let Some(qs) = &args.questions {
            qs.iter()
                .enumerate()
                .map(|(index, item)| {
                    let mut question = parse_question(item);
                    if question.id.trim().is_empty() {
                        question.id = format!("question-{}", index + 1);
                    }
                    question
                })
                .collect()
        } else {
            let q = match args.question.clone() {
                Some(question) => question,
                None => return Err("No question provided".to_string()),
            };
            if q.is_empty() {
                return Err("No question provided".to_string());
            }
            let options = match args.options.clone() {
                Some(options) => options,
                None => return Err("Ask questions require options".to_string()),
            };
            let selection_type = match args.selection_type.clone() {
                Some(selection_type) => selection_type,
                None => return Err("Ask questions require selectionType".to_string()),
            };
            vec![AskQuestion {
                id: "question-1".to_string(),
                question: q,
                options,
                selection_type,
            }]
        };

        if questions.is_empty() {
            return Err("No questions provided".to_string());
        }

        for q in &questions {
            if let Err(e) = q.validate() {
                return Err(format!("Invalid question: {}", e));
            }
        }

        let (tx, rx) = oneshot::channel();
        ask::set_ask_waiter(ctx.tool_call_id.clone(), tx).await;

        let first = &questions[0];
        let title = args.title.trim().to_string();
        if title.is_empty() {
            return Err("Ask requests require title".to_string());
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

        let answer = tokio::select! {
            answer = rx => answer,
            _ = wait_for_interrupt(&ctx.session_id) => {
                let _ = ask::remove_ask_waiter(&ctx.tool_call_id).await;
                return Err("Ask request was interrupted".to_string());
            }
        };

        match answer {
            Ok(answer) => Ok(answer),
            Err(_) => {
                // Clean up stale waiter on drop
                let _ = ask::remove_ask_waiter(&ctx.tool_call_id).await;
                Err("Ask request was cancelled or dropped".to_string())
            }
        }
    }
}

fn render_ask_response(response: &AskResponse) -> String {
    response
        .answers
        .iter()
        .map(|answer| {
            let selected = answer.selected.join(", ");
            let detail = answer.text.trim();
            [selected, detail.to_string()]
                .into_iter()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join(" | ")
        })
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

async fn wait_for_interrupt(session_id: &str) {
    loop {
        if crate::domains::chat::interrupts::is_interrupted(session_id).await {
            return;
        }
        sleep(Duration::from_millis(50)).await;
    }
}
