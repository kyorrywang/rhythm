use super::{
    apply_history_replay_policy, ChatMessage, ChatMessageBlock, LlmClient, LlmResponse,
    LlmResponseStream, LlmToolDefinition,
};
use crate::platform::config::LlmConfig;
use crate::shared::text::truncate_chars;
use async_trait::async_trait;
use futures::StreamExt;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[path = "openai_support.rs"]
mod support;

use support::{
    map_openai_messages, map_openai_tools, process_openai_line, OpenAiChatRequest,
    ToolCallAccumulator,
};

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

#[async_trait]
impl LlmClient for OpenAiClient {
    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tools: Vec<LlmToolDefinition>,
    ) -> Result<LlmResponseStream, String> {
        let url = format!("{}/chat/completions", self.config.base_url);

        let tools_mapped = map_openai_tools(tools);

        let messages = apply_history_replay_policy(&self.config, messages);
        let req = OpenAiChatRequest {
            model: self.config.model.clone(),
            messages: map_openai_messages(messages),
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
