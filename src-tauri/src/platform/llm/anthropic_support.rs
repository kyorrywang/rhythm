use super::{ChatMessage, ChatMessageBlock, LlmResponse, LlmToolDefinition};
use crate::platform::llm::LlmToolCall;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Serialize)]
pub(super) struct AnthropicTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Serialize)]
pub(super) struct AnthropicChatRequest {
    pub model: String,
    pub messages: Vec<AnthropicMessage>,
    pub max_tokens: u32,
    pub stream: bool,
    pub thinking: Option<AnthropicThinking>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<AnthropicTool>>,
}

#[derive(Serialize)]
pub(super) struct AnthropicMessage {
    pub role: String,
    pub content: Vec<AnthropicContent>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
pub(super) enum AnthropicContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { source: AnthropicImageSource },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "std::ops::Not::not")]
        is_error: bool,
    },
}

#[derive(Serialize)]
pub(super) struct AnthropicImageSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub media_type: String,
    pub data: String,
}

#[derive(Serialize)]
pub(super) struct AnthropicThinking {
    #[serde(rename = "type")]
    pub thinking_type: String,
    pub budget_tokens: u32,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum AnthropicEvent {
    #[serde(rename = "message_start")]
    MessageStart,
    #[serde(rename = "content_block_start")]
    ContentBlockStart {
        index: u32,
        content_block: AnthropicContentBlock,
    },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta { index: u32, delta: AnthropicDelta },
    #[serde(rename = "content_block_stop")]
    ContentBlockStop { index: u32 },
    #[serde(rename = "message_delta")]
    MessageDelta,
    #[serde(rename = "message_stop")]
    MessageStop,
    #[serde(rename = "ping")]
    Ping,
}

#[derive(Deserialize, Debug)]
struct AnthropicContentBlock {
    #[serde(default)]
    id: Option<String>,
    #[serde(rename = "type")]
    block_type: String,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum AnthropicDelta {
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(rename = "thinking_delta")]
    ThinkingDelta { thinking: String },
    #[serde(rename = "input_json_delta")]
    InputJsonDelta { partial_json: String },
    #[serde(other)]
    Other,
}

pub(super) struct ToolUseAccumulator {
    pub id: String,
    pub name: String,
    pub input_json: String,
}

pub(super) fn map_anthropic_tools(tools: Vec<LlmToolDefinition>) -> Option<Vec<AnthropicTool>> {
    if tools.is_empty() {
        None
    } else {
        Some(
            tools
                .into_iter()
                .map(|t| AnthropicTool {
                    name: t.name,
                    description: t.description,
                    input_schema: t.parameters,
                })
                .collect(),
        )
    }
}

pub(super) fn process_anthropic_line(
    data: &str,
    thinking_indices: &mut HashSet<u32>,
    tool_use_accum: &mut HashMap<u32, ToolUseAccumulator>,
) -> Vec<Result<LlmResponse, String>> {
    let mut deltas = Vec::new();

    let Ok(ev) = serde_json::from_str::<AnthropicEvent>(data) else {
        return deltas;
    };

    match ev {
        AnthropicEvent::ContentBlockStart {
            index,
            content_block,
        } => match content_block.block_type.as_str() {
            "thinking" => {
                thinking_indices.insert(index);
            }
            "tool_use" => {
                if let Some(name) = &content_block.name {
                    tool_use_accum.insert(
                        index,
                        ToolUseAccumulator {
                            id: content_block.id.unwrap_or_default(),
                            name: name.clone(),
                            input_json: String::new(),
                        },
                    );
                }
            }
            _ => {}
        },
        AnthropicEvent::ContentBlockDelta {
            delta: AnthropicDelta::TextDelta { text },
            ..
        } => {
            deltas.push(Ok(LlmResponse::TextDelta(text)));
        }
        AnthropicEvent::ContentBlockDelta {
            delta: AnthropicDelta::ThinkingDelta { thinking },
            ..
        } => {
            deltas.push(Ok(LlmResponse::ThinkingDelta(thinking)));
        }
        AnthropicEvent::ContentBlockDelta {
            delta: AnthropicDelta::InputJsonDelta { partial_json },
            index,
        } => {
            if let Some(acc) = tool_use_accum.get_mut(&index) {
                acc.input_json.push_str(&partial_json);
                if !acc.id.is_empty() && !acc.name.is_empty() {
                    deltas.push(Ok(LlmResponse::ToolCallDelta(LlmToolCall {
                        id: acc.id.clone(),
                        name: acc.name.clone(),
                        arguments: acc.input_json.clone(),
                    })));
                }
            }
        }
        AnthropicEvent::ContentBlockStop { index } => {
            if thinking_indices.contains(&index) {
                deltas.push(Ok(LlmResponse::ThinkingEnd));
            }
            if let Some(acc) = tool_use_accum.remove(&index) {
                deltas.push(Ok(LlmResponse::ToolCall(LlmToolCall {
                    id: if acc.id.is_empty() {
                        format!("toolu_{}", index)
                    } else {
                        acc.id
                    },
                    name: acc.name,
                    arguments: if acc.input_json.is_empty() {
                        "{}".to_string()
                    } else {
                        acc.input_json
                    },
                })));
            }
        }
        AnthropicEvent::MessageStop => {
            deltas.push(Ok(LlmResponse::Done));
        }
        _ => {}
    }

    deltas
}

pub(super) fn flush_anthropic_buffer(
    buffer: &mut String,
    thinking_indices: &mut HashSet<u32>,
    tool_use_accum: &mut HashMap<u32, ToolUseAccumulator>,
) -> Vec<Result<LlmResponse, String>> {
    let mut deltas = Vec::new();

    while let Some(newline_pos) = buffer.find('\n') {
        let line = buffer[..newline_pos].to_string();
        *buffer = buffer[newline_pos + 1..].to_string();

        let line = line.trim_end_matches('\r');

        if line.starts_with("data: ") {
            let data = &line[6..];
            let line_deltas = process_anthropic_line(data, thinking_indices, tool_use_accum);
            deltas.extend(line_deltas);
        }
    }

    if !buffer.trim().is_empty() {
        let trailing = std::mem::take(buffer);
        for line in trailing.split('\n') {
            let line = line.trim();
            if line.starts_with("data: ") {
                let data = &line[6..];
                let line_deltas = process_anthropic_line(data, thinking_indices, tool_use_accum);
                deltas.extend(line_deltas);
            }
        }
    }

    deltas
}

pub(super) fn map_anthropic_messages(messages: Vec<ChatMessage>) -> Vec<AnthropicMessage> {
    let mut mapped = Vec::new();

    for message in messages {
        let mut tool_results = Vec::new();
        let mut other_content = Vec::new();

        for block in message.blocks {
            match block {
                ChatMessageBlock::Text { text } => {
                    other_content.push(AnthropicContent::Text { text });
                }
                ChatMessageBlock::Image { media_type, data } => {
                    other_content.push(AnthropicContent::Image {
                        source: AnthropicImageSource {
                            source_type: "base64".to_string(),
                            media_type,
                            data,
                        },
                    });
                }
                ChatMessageBlock::File {
                    name,
                    mime_type,
                    size,
                    text,
                } => {
                    other_content.push(AnthropicContent::Text {
                        text: format_file_block(&name, &mime_type, size, text.as_deref()),
                    });
                }
                ChatMessageBlock::ToolCall {
                    id,
                    name,
                    arguments,
                } => {
                    other_content.push(AnthropicContent::ToolUse {
                        id,
                        name,
                        input: arguments,
                    });
                }
                ChatMessageBlock::ToolResult {
                    tool_call_id,
                    content,
                    is_error,
                } => {
                    tool_results.push(AnthropicContent::ToolResult {
                        tool_use_id: tool_call_id,
                        content,
                        is_error,
                    });
                }
            }
        }

        let content = if message.role == "user" && !tool_results.is_empty() {
            tool_results
                .into_iter()
                .chain(other_content.into_iter())
                .collect()
        } else {
            other_content
        };

        if !content.is_empty() {
            mapped.push(AnthropicMessage {
                role: message.role,
                content,
            });
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
