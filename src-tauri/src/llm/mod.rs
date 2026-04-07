use async_trait::async_trait;
use futures::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::pin::Pin;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub blocks: Vec<ChatMessageBlock>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatAttachment {
    pub id: String,
    pub kind: String,
    pub name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    pub size: u64,
    #[serde(rename = "dataUrl")]
    pub data_url: Option<String>,
    #[serde(rename = "previewUrl")]
    pub preview_url: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ChatMessageBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { media_type: String, data: String },
    #[serde(rename = "file")]
    File {
        name: String,
        mime_type: String,
        size: u64,
        text: Option<String>,
    },
    #[serde(rename = "tool_call")]
    ToolCall {
        id: String,
        name: String,
        arguments: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        content: String,
        #[serde(default)]
        is_error: bool,
    },
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
    ThinkingDelta(String),
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

pub mod anthropic;
pub mod openai;

use crate::infrastructure::config::LlmConfig;
use anthropic::AnthropicClient;
use openai::OpenAiClient;

pub fn create_client(config: &LlmConfig) -> Box<dyn LlmClient> {
    match config.provider.to_lowercase().as_str() {
        "anthropic" => Box::new(AnthropicClient::new(config.clone())),
        _ => Box::new(OpenAiClient::new(config.clone())),
    }
}
