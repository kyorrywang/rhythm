use super::{ChatMessage, ChatMessageBlock, LlmResponse, LlmToolDefinition};
use crate::infra::llm::LlmToolCall;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Serialize)]
pub(super) struct OpenAiTool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: OpenAiFunction,
}

#[derive(Serialize)]
pub(super) struct OpenAiFunction {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Serialize)]
pub(super) struct OpenAiChatRequest {
    pub model: String,
    pub messages: Vec<OpenAiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<OpenAiTool>>,
    pub stream: bool,
}

#[derive(Serialize)]
pub(super) struct OpenAiMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<OpenAiMessageContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<OpenAiRequestToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Serialize)]
#[serde(untagged)]
pub(super) enum OpenAiMessageContent {
    Text(String),
    Parts(Vec<OpenAiContentPart>),
}

#[derive(Serialize)]
#[serde(tag = "type")]
pub(super) enum OpenAiContentPart {
    #[serde(rename = "image_url")]
    ImageUrl { image_url: OpenAiImageUrl },
}

#[derive(Serialize)]
pub(super) struct OpenAiImageUrl {
    pub url: String,
}

#[derive(Serialize)]
pub(super) struct OpenAiRequestToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: OpenAiRequestToolFunction,
}

#[derive(Serialize)]
pub(super) struct OpenAiRequestToolFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Deserialize)]
struct OpenAiChunk {
    choices: Vec<OpenAiChoice>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    delta: OpenAiDelta,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiDelta {
    content: Option<String>,
    reasoning_content: Option<String>,
    tool_calls: Option<Vec<OpenAiToolCallChunk>>,
}

#[derive(Deserialize)]
struct OpenAiToolCallChunk {
    index: Option<usize>,
    id: Option<String>,
    function: Option<OpenAiToolFunctionChunk>,
}

#[derive(Deserialize)]
struct OpenAiToolFunctionChunk {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Default)]
pub(super) struct ToolCallAccumulator {
    pub id: String,
    pub name: String,
    pub arguments: String,
    pub emitted: bool,
}

pub(super) fn map_openai_tools(tools: Vec<LlmToolDefinition>) -> Option<Vec<OpenAiTool>> {
    if tools.is_empty() {
        None
    } else {
        Some(
            tools
                .into_iter()
                .map(|t| OpenAiTool {
                    tool_type: "function".to_string(),
                    function: OpenAiFunction {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters,
                    },
                })
                .collect(),
        )
    }
}

fn emit_completed_tool_calls(
    tool_calls_accum: &mut HashMap<usize, ToolCallAccumulator>,
) -> Vec<Result<LlmResponse, String>> {
    let mut deltas = Vec::new();

    for tc in tool_calls_accum.values_mut() {
        if tc.emitted || tc.id.is_empty() || tc.name.is_empty() {
            continue;
        }
        deltas.push(Ok(LlmResponse::ToolCall(LlmToolCall {
            id: tc.id.clone(),
            name: tc.name.clone(),
            arguments: if tc.arguments.is_empty() {
                "{}".to_string()
            } else {
                tc.arguments.clone()
            },
        })));
        tc.emitted = true;
    }

    deltas
}

pub(super) fn process_openai_line(
    data: &str,
    tool_calls_accum: &mut HashMap<usize, ToolCallAccumulator>,
) -> Vec<Result<LlmResponse, String>> {
    let mut deltas = Vec::new();

    if data == "[DONE]" {
        deltas.extend(emit_completed_tool_calls(tool_calls_accum));
        deltas.push(Ok(LlmResponse::Done));
        return deltas;
    }

    let Ok(chunk) = serde_json::from_str::<OpenAiChunk>(data) else {
        return deltas;
    };

    let Some(choice) = chunk.choices.first() else {
        return deltas;
    };

    if let Some(reasoning) = &choice.delta.reasoning_content {
        if !reasoning.is_empty() {
            deltas.push(Ok(LlmResponse::ThinkingDelta(reasoning.clone())));
        }
    }

    if let Some(content) = &choice.delta.content {
        if !content.is_empty() {
            deltas.push(Ok(LlmResponse::TextDelta(content.clone())));
        }
    }

    if let Some(tool_calls) = &choice.delta.tool_calls {
        for tc in tool_calls {
            if let Some(index) = tc.index {
                let entry = tool_calls_accum
                    .entry(index)
                    .or_insert_with(ToolCallAccumulator::default);
                if let Some(id) = &tc.id {
                    entry.id = id.clone();
                }
                if let Some(func) = &tc.function {
                    if let Some(name) = &func.name {
                        entry.name = name.clone();
                    }
                    if let Some(args) = &func.arguments {
                        entry.arguments.push_str(args);
                        if !entry.id.is_empty() && !entry.name.is_empty() {
                            deltas.push(Ok(LlmResponse::ToolCallDelta(LlmToolCall {
                                id: entry.id.clone(),
                                name: entry.name.clone(),
                                arguments: entry.arguments.clone(),
                            })));
                        }
                    }
                }
            }
        }
    }

    match choice.finish_reason.as_deref() {
        Some("stop") => {
            deltas.push(Ok(LlmResponse::Done));
        }
        Some("tool_calls") => {
            deltas.extend(emit_completed_tool_calls(tool_calls_accum));
        }
        _ => {}
    }

    deltas
}

pub(super) fn map_openai_messages(messages: Vec<ChatMessage>) -> Vec<OpenAiMessage> {
    let mut mapped = Vec::new();

    for message in messages {
        for block in message.blocks {
            match block {
                ChatMessageBlock::Text { text } => {
                    mapped.push(OpenAiMessage {
                        role: message.role.clone(),
                        content: Some(OpenAiMessageContent::Text(text)),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                ChatMessageBlock::Image { media_type, data } => {
                    mapped.push(OpenAiMessage {
                        role: message.role.clone(),
                        content: Some(OpenAiMessageContent::Parts(vec![
                            OpenAiContentPart::ImageUrl {
                                image_url: OpenAiImageUrl {
                                    url: format!("data:{};base64,{}", media_type, data),
                                },
                            },
                        ])),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                ChatMessageBlock::File {
                    name,
                    mime_type,
                    size,
                    text,
                } => {
                    mapped.push(OpenAiMessage {
                        role: message.role.clone(),
                        content: Some(OpenAiMessageContent::Text(format_file_block(
                            &name,
                            &mime_type,
                            size,
                            text.as_deref(),
                        ))),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }
                ChatMessageBlock::ToolCall {
                    id,
                    name,
                    arguments,
                } => {
                    mapped.push(OpenAiMessage {
                        role: "assistant".to_string(),
                        content: None,
                        tool_calls: Some(vec![OpenAiRequestToolCall {
                            id,
                            tool_type: "function".to_string(),
                            function: OpenAiRequestToolFunction {
                                name,
                                arguments: arguments.to_string(),
                            },
                        }]),
                        tool_call_id: None,
                    });
                }
                ChatMessageBlock::ToolResult {
                    tool_call_id,
                    content,
                    ..
                } => {
                    mapped.push(OpenAiMessage {
                        role: "tool".to_string(),
                        content: Some(OpenAiMessageContent::Text(content)),
                        tool_calls: None,
                        tool_call_id: Some(tool_call_id),
                    });
                }
            }
        }
    }

    mapped
}

fn format_file_block(name: &str, mime_type: &str, size: u64, text: Option<&str>) -> String {
    match text {
        Some(text) => format!(
            "Attached file: {}\nMIME type: {}\nSize: {} bytes\n\n{}",
            name, mime_type, size, text
        ),
        None => format!(
            "Attached file: {}\nMIME type: {}\nSize: {} bytes\nContent was not included because it is binary or too large.",
            name, mime_type, size
        ),
    }
}
