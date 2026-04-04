use serde::{Deserialize, Serialize};
use serde_json::Value;
use futures::{StreamExt, Stream};
use crate::infrastructure::config::LlmConfig;
use super::{LlmClient, ChatMessage, LlmToolDefinition, LlmResponse, LlmResponseStream};
use async_trait::async_trait;

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

#[derive(Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<Value>>,
    stream: bool,
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
    tool_calls: Option<Vec<Value>>, // Simplified
}

#[async_trait]
impl LlmClient for OpenAiClient {
    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        _tools: Vec<LlmToolDefinition>, // Tools temporarily skipped for simplicity in first pass, or implemented later
    ) -> Result<LlmResponseStream, String> {
        let url = format!("{}/chat/completions", self.config.base_url);
        
        let req = OpenAiChatRequest {
            model: self.config.model.clone(),
            messages,
            tools: None, // Tools will be added next
            stream: true,
        };

        let response = self.client.post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&req)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let stream = response.bytes_stream().map(move |item| {
            match item {
               Ok(bytes) => {
                   let text = String::from_utf8_lossy(&bytes);
                   // OpenAI streams send multiple "data: {json}" lines
                   let mut deltas = Vec::new();
                   for line in text.split('\n') {
                       if line.starts_with("data: ") {
                           let data = &line[6..].trim();
                           if *data == "[DONE]" {
                               deltas.push(Ok(LlmResponse::Done));
                           } else if let Ok(chunk) = serde_json::from_str::<OpenAiChunk>(data) {
                               if let Some(choice) = chunk.choices.first() {
                                   if let Some(content) = &choice.delta.content {
                                       deltas.push(Ok(LlmResponse::TextDelta(content.clone())));
                                   }
                               }
                           }
                       }
                   }
                   futures::stream::iter(deltas)
               }
               Err(e) => futures::stream::iter(vec![Err(e.to_string())]),
            }
        }).flatten();

        Ok(Box::pin(stream))
    }
}
