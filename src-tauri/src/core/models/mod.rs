use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use futures::Stream;
use std::pin::Pin;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<LlmToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

pub enum LlmResponse {
    TextDelta(String),
    ToolCall(LlmToolCall),
    ThinkingEnd,
    Done,
}

pub type LlmResponseStream = Pin<Box<dyn Stream<Item = Result<LlmResponse, String>> + Send>>;

#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        tools: Vec<LlmToolDefinition>,
    ) -> Result<LlmResponseStream, String>;
}

pub mod openai;
pub mod anthropic;

use crate::infrastructure::config::LlmConfig;
use openai::OpenAiClient;
use anthropic::AnthropicClient;

pub fn create_client(config: &LlmConfig) -> Box<dyn LlmClient> {
    match config.provider.to_lowercase().as_str() {
        "anthropic" => Box::new(AnthropicClient::new(config.clone())),
        _ => Box::new(OpenAiClient::new(config.clone())),
    }
}
