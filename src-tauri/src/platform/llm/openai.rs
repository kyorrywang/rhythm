use super::{
    apply_history_replay_policy, ChatMessage, ChatMessageBlock, LlmClient, LlmResponse,
    LlmResponseStream, LlmToolDefinition,
};
use crate::platform::config::LlmConfig;
use crate::shared::text::truncate_chars;
use async_trait::async_trait;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct OpenAiClient {
    config: LlmConfig,
    client: reqwest::Client,
}

impl OpenAiClient {
    pub fn new(config: LlmConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }
}

fn summarize_http_error(prefix: &str, status: reqwest::StatusCode, body: &str) -> String {
    let compact_body = body.replace('\n', " ");
    let trimmed = compact_body.trim();
    let excerpt = truncate_chars(trimmed, 400);
    if excerpt.is_empty() {
        format!("{prefix}: http {}", status.as_u16())
    } else {
        format!("{prefix}: http {} - {}", status.as_u16(), excerpt)
    }
}

fn summarize_reqwest_error(prefix: &str, error: reqwest::Error) -> String {
    if error.is_timeout() {
        return format!("{prefix}: timeout - {error}");
    }
    if error.is_connect() {
        return format!("{prefix}: connect error - {error}");
    }
    if error.is_request() {
        return format!("{prefix}: request failed - {error}");
    }
    if error.is_body() {
        return format!("{prefix}: response body error - {error}");
    }
    format!("{prefix}: {error}")
}

#[derive(Serialize)]
struct OpenAiTool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAiFunction,
}

#[derive(Serialize)]
struct OpenAiFunction {
    name: String,
    description: String,
    parameters: Value,
}

#[derive(Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAiTool>>,
    stream: bool,
}

#[derive(Serialize)]
struct OpenAiMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<OpenAiMessageContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAiRequestToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum OpenAiMessageContent {
    Text(String),
    Parts(Vec<OpenAiContentPart>),
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum OpenAiContentPart {
    #[serde(rename = "image_url")]
    ImageUrl { image_url: OpenAiImageUrl },
}

#[derive(Serialize)]
struct OpenAiImageUrl {
    url: String,
}

#[derive(Serialize)]
struct OpenAiRequestToolCall {
    id: String,
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAiRequestToolFunction,
}

#[derive(Serialize)]
struct OpenAiRequestToolFunction {
    name: String,
    arguments: String,
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
struct ToolCallAccumulator {
    id: String,
    name: String,
    arguments: String,
    emitted: bool,
}

fn emit_completed_tool_calls(
    tool_calls_accum: &mut HashMap<usize, ToolCallAccumulator>,
) -> Vec<Result<LlmResponse, String>> {
    let mut deltas = Vec::new();

    for tc in tool_calls_accum.values_mut() {
        if tc.emitted || tc.id.is_empty() || tc.name.is_empty() {
            continue;
        }
        deltas.push(Ok(LlmResponse::ToolCall(super::LlmToolCall {
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

fn process_openai_line(
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
                            deltas.push(Ok(LlmResponse::ToolCallDelta(super::LlmToolCall {
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

fn map_messages(messages: Vec<ChatMessage>) -> Vec<OpenAiMessage> {
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

#[async_trait]
impl LlmClient for OpenAiClient {
    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tools: Vec<LlmToolDefinition>,
    ) -> Result<LlmResponseStream, String> {
        let url = format!("{}/chat/completions", self.config.base_url);

        let tools_mapped = if tools.is_empty() {
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
        };

        let messages = apply_history_replay_policy(&self.config, messages);
        let req = OpenAiChatRequest {
            model: self.config.model.clone(),
            messages: map_messages(messages),
            tools: tools_mapped,
            stream: true,
        };

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&req)
            .send()
            .await
            .map_err(|e| summarize_reqwest_error("openai request", e))?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(summarize_http_error("openai request failed", status, &body));
        }

        let tool_calls_accum: Arc<Mutex<HashMap<usize, ToolCallAccumulator>>> =
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

                        let mut acc = tool_calls_accum.lock().unwrap();

                        while let Some(newline_pos) = buf.find('\n') {
                            let line = buf[..newline_pos].to_string();
                            *buf = buf[newline_pos + 1..].to_string();

                            let line = line.trim_end_matches('\r');

                            if line.starts_with("data: ") {
                                let data = &line[6..];
                                let line_deltas = process_openai_line(data, &mut acc);
                                deltas.extend(line_deltas);
                            }
                        }
                    }

                    futures::stream::iter(deltas)
                }
                Err(e) => {
                    let mut buf = buffer.lock().unwrap();
                    let mut acc = tool_calls_accum.lock().unwrap();
                    let mut deltas = Vec::new();

                    if !buf.is_empty() {
                        let remaining = std::mem::take(&mut *buf);
                        for line in remaining.split('\n') {
                            let line = line.trim();
                            if line.starts_with("data: ") {
                                let data = &line[6..];
                                let line_deltas = process_openai_line(data, &mut acc);
                                deltas.extend(line_deltas);
                            }
                        }
                    }

                    deltas.push(Err(summarize_reqwest_error("openai stream", e)));

                    futures::stream::iter(deltas)
                }
            })
            .flatten();

        Ok(Box::pin(stream))
    }
}
