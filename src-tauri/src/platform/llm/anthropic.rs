use super::{
    apply_history_replay_policy, ChatMessage, ChatMessageBlock, LlmClient, LlmResponse,
    LlmResponseStream, LlmToolDefinition,
};
use crate::platform::config::LlmConfig;
use crate::shared::text::truncate_chars;
use async_trait::async_trait;
use futures::StreamExt;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

#[path = "anthropic_support.rs"]
mod support;

use support::{
    flush_anthropic_buffer, map_anthropic_messages, map_anthropic_tools, AnthropicChatRequest,
    AnthropicThinking, ToolUseAccumulator,
};

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
impl LlmClient for AnthropicClient {
    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tools: Vec<LlmToolDefinition>,
    ) -> Result<LlmResponseStream, String> {
        let url = format!("{}/messages", self.config.base_url);

        let tools_mapped = map_anthropic_tools(tools);

        let supports_extended_thinking = self.supports_extended_thinking();
        let messages = apply_history_replay_policy(&self.config, messages);
        let req = AnthropicChatRequest {
            model: self.config.model.clone(),
            messages: map_anthropic_messages(messages),
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
            .map_err(|e| summarize_reqwest_error("anthropic request", e))?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(summarize_http_error(
                "anthropic request failed",
                status,
                &body,
            ));
        }

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
                    deltas.push(Err(summarize_reqwest_error("anthropic stream", e)));

                    futures::stream::iter(deltas)
                }
            })
            .flatten();

        Ok(Box::pin(stream))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::llm::{ChatMessage, ChatMessageBlock};
    use serde_json::json;

    #[test]
    fn map_messages_includes_tool_results_for_user_messages() {
        let mapped = map_messages(vec![
            ChatMessage {
                role: "assistant".to_string(),
                blocks: vec![ChatMessageBlock::ToolCall {
                    id: "toolu_1".to_string(),
                    name: "plan_tasks".to_string(),
                    arguments: json!({ "workspace": "demo", "tasks": [] }),
                }],
            },
            ChatMessage {
                role: "user".to_string(),
                blocks: vec![
                    ChatMessageBlock::ToolResult {
                        tool_call_id: "toolu_1".to_string(),
                        content: "ok".to_string(),
                        is_error: false,
                    },
                    ChatMessageBlock::Text {
                        text: "continue".to_string(),
                    },
                ],
            },
        ]);

        assert_eq!(mapped.len(), 2);
        assert_eq!(mapped[1].role, "user");
        assert!(matches!(
            mapped[1].content.first(),
            Some(AnthropicContent::ToolResult { tool_use_id, content, is_error })
                if tool_use_id == "toolu_1" && content == "ok" && !is_error
        ));
        assert!(matches!(
            mapped[1].content.get(1),
            Some(AnthropicContent::Text { text }) if text == "continue"
        ));
    }
}
