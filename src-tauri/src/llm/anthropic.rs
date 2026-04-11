use super::{
    ChatMessage, ChatMessageBlock, LlmClient, LlmResponse, LlmResponseStream, LlmToolDefinition,
};
use crate::infrastructure::config::LlmConfig;
use async_trait::async_trait;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

pub struct AnthropicClient {
    config: LlmConfig,
    client: reqwest::Client,
}

impl AnthropicClient {
    pub fn new(config: LlmConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    fn supports_extended_thinking(&self) -> bool {
        self.config
            .capabilities
            .anthropic_extended_thinking
            .unwrap_or(false)
    }

    fn supports_beta_headers(&self) -> bool {
        self.config
            .capabilities
            .anthropic_beta_headers
            .unwrap_or(false)
    }
}

#[derive(Serialize)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: Value,
}

#[derive(Serialize)]
struct AnthropicChatRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    max_tokens: u32,
    stream: bool,
    thinking: Option<AnthropicThinking>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContent>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum AnthropicContent {
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
        #[serde(rename = "tool_use_id")]
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "std::ops::Not::not")]
        is_error: bool,
    },
}

#[derive(Serialize)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String,
    media_type: String,
    data: String,
}

#[derive(Serialize)]
struct AnthropicThinking {
    #[serde(rename = "type")]
    thinking_type: String,
    budget_tokens: u32,
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

struct ToolUseAccumulator {
    id: String,
    name: String,
    input_json: String,
}

fn process_anthropic_line(
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
                    deltas.push(Ok(LlmResponse::ToolCallDelta(super::LlmToolCall {
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
                deltas.push(Ok(LlmResponse::ToolCall(super::LlmToolCall {
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

fn flush_anthropic_buffer(
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

fn map_messages(messages: Vec<ChatMessage>) -> Vec<AnthropicMessage> {
    let mut mapped = Vec::new();

    for message in messages {
        let mut content = Vec::new();

        for block in message.blocks {
            match block {
                ChatMessageBlock::Text { text } => {
                    content.push(AnthropicContent::Text { text });
                }
                ChatMessageBlock::Image { media_type, data } => {
                    content.push(AnthropicContent::Image {
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
                    content.push(AnthropicContent::Text {
                        text: format_file_block(&name, &mime_type, size, text.as_deref()),
                    });
                }
                ChatMessageBlock::ToolCall {
                    id,
                    name,
                    arguments,
                } => {
                    content.push(AnthropicContent::ToolUse {
                        id,
                        name,
                        input: arguments,
                    });
                }
                ChatMessageBlock::ToolResult {
                    tool_call_id,
                    content: block_content,
                    is_error,
                } => {
                    content.push(AnthropicContent::ToolResult {
                        tool_use_id: tool_call_id,
                        content: block_content,
                        is_error,
                    });
                }
            }
        }

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

#[async_trait]
impl LlmClient for AnthropicClient {
    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tools: Vec<LlmToolDefinition>,
    ) -> Result<LlmResponseStream, String> {
        let url = format!("{}/messages", self.config.base_url);

        let tools_mapped = if tools.is_empty() {
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
        };

        let supports_extended_thinking = self.supports_extended_thinking();
        let req = AnthropicChatRequest {
            model: self.config.model.clone(),
            messages: map_messages(messages),
            max_tokens: 8192,
            stream: true,
            thinking: supports_extended_thinking.then_some(AnthropicThinking {
                thinking_type: "enabled".to_string(),
                budget_tokens: 4096,
            }),
            tools: tools_mapped,
        };

        let mut request = self
            .client
            .post(&url)
            .header("x-api-key", &self.config.api_key)
            .header("anthropic-version", "2023-06-01");
        if self.supports_beta_headers() {
            request = request.header("anthropic-beta", "extended-thinking-2025-05-14");
        }
        let response = request
            .json(&req)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let response = response.error_for_status().map_err(|e| e.to_string())?;

        let thinking_indices: Arc<Mutex<HashSet<u32>>> = Arc::new(Mutex::new(HashSet::new()));
        let tool_use_accum: Arc<Mutex<HashMap<u32, ToolUseAccumulator>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let buffer: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));

        let stream = response
            .bytes_stream()
            .map(move |item| match item {
                Ok(bytes) => {
                    let chunk_text = String::from_utf8_lossy(&bytes);
                    let mut deltas = Vec::new();

                    {
                        let mut buf = buffer.lock().unwrap();
                        buf.push_str(&chunk_text);

                        let mut thinking = thinking_indices.lock().unwrap();
                        let mut tools = tool_use_accum.lock().unwrap();
                        deltas.extend(flush_anthropic_buffer(&mut buf, &mut thinking, &mut tools));
                    }

                    futures::stream::iter(deltas)
                }
                Err(e) => {
                    let mut buf = buffer.lock().unwrap();
                    let mut thinking = thinking_indices.lock().unwrap();
                    let mut tools = tool_use_accum.lock().unwrap();
                    let mut deltas = Vec::new();
                    deltas.extend(flush_anthropic_buffer(&mut buf, &mut thinking, &mut tools));

                    if deltas.is_empty() {
                        deltas.push(Err(e.to_string()));
                    } else if !deltas.iter().any(|item| matches!(item, Ok(LlmResponse::Done))) {
                        deltas.push(Ok(LlmResponse::Done));
                    }

                    futures::stream::iter(deltas)
                }
            })
            .flatten();

        Ok(Box::pin(stream))
    }
}
