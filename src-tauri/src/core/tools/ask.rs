use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use crate::shared::schema::{EventPayload, AskQuestion};
use crate::core::event_bus;
use crate::core::state;
use super::AgentTool;
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

fn to_schema_question() -> Value {
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
            },
            "selectionType": {
                "type": "string",
                "enum": ["single", "multiple", "input", "single_with_input", "multiple_with_input"],
                "default": "multiple_with_input",
                "description": "How the user should respond: single (radio), multiple (checkbox), input (text only), single_with_input (radio + text), multiple_with_input (checkbox + text)"
            },
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": { "type": "string", "description": "The question to ask" },
                        "options": { "type": "array", "items": { "type": "string" }, "description": "Answer options" },
                        "selectionType": { "type": "string", "enum": ["single", "multiple", "input", "single_with_input", "multiple_with_input"], "default": "multiple_with_input" }
                    },
                    "required": ["question"]
                },
                "description": "Multiple questions to ask sequentially. If provided, 'question', 'options', and 'selectionType' are ignored."
            }
        },
        "required": []
    })
}

#[async_trait]
impl AgentTool for AskTool {
    fn name(&self) -> &'static str {
        "ask_user"
    }

    fn description(&self) -> &'static str {
        "Ask the user one or more questions and wait for their answers. Use 'questions' for multiple questions, or 'question' for a single one."
    }

    fn parameters(&self) -> Value {
        to_schema_question()
    }

    async fn execute(&self, agent_id: &str, session_id: &str, tool_call_id: &str, args: Value) -> Result<String, String> {
        let args: AskArgs = serde_json::from_value(args).map_err(|e| e.to_string())?;

        let questions: Vec<AskQuestion> = if let Some(qs) = &args.questions {
            qs.iter().map(parse_question).collect()
        } else {
            let q = args.question.unwrap_or_default();
            if q.is_empty() {
                return Err("No question provided".into());
            }
            vec![AskQuestion {
                question: q,
                options: args.options.clone().unwrap_or_default(),
                selection_type: args.selection_type.clone().unwrap_or_else(default_selection_type),
            }]
        };

        if questions.is_empty() {
            return Err("No questions provided".into());
        }

        for q in &questions {
            let st = &q.selection_type;
            if (st == "single" || st == "multiple") && q.options.is_empty() {
                return Err(format!("selectionType '{}' requires at least one option for question: {}", st, q.question));
            }
        }

        let (tx, rx) = oneshot::channel();
        state::set_ask_waiter(session_id.to_string(), tx).await;

        let first = &questions[0];
        event_bus::emit(agent_id, session_id, EventPayload::AskRequest {
            tool_id: tool_call_id.to_string(),
            question: first.question.clone(),
            options: first.options.clone(),
            selection_type: first.selection_type.clone(),
            questions: questions.clone(),
        });

        match rx.await {
            Ok(answer) => Ok(answer),
            Err(_) => Err("Ask request was cancelled or dropped".into()),
        }
    }
}
