use serde::{Deserialize, Serialize};
use serde_json::Value;
use futures::{StreamExt, Stream};
use crate::infrastructure::config::LlmConfig;
use super::{LlmClient, ChatMessage, LlmToolDefinition, LlmResponse, LlmResponseStream};
use async_trait::async_trait;

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
}

#[derive(Serialize)]
struct AnthropicChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
    stream: bool,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum AnthropicEvent {
    #[serde(rename = "message_start")]
    MessageStart { message: Value },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta { delta: AnthropicDelta },
    #[serde(rename = "message_delta")]
    MessageDelta { delta: Value },
    #[serde(rename = "message_stop")]
    MessageStop,
    #[serde(rename = "ping")]
    Ping,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum AnthropicDelta {
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(other)]
    Other,
}

#[async_trait]
impl LlmClient for AnthropicClient {
    async fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
        _tools: Vec<LlmToolDefinition>,
    ) -> Result<LlmResponseStream, String> {
        let url = format!("{}/messages", self.config.base_url);
        
        let req = AnthropicChatRequest {
            model: self.config.model.clone(),
            messages,
            max_tokens: 4096,
            stream: true,
        };

        let response = self.client.post(&url)
            .header("x-api-key", &self.config.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&req)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let stream = response.bytes_stream().map(move |item| {
            match item {
               Ok(bytes) => {
                   let text = String::from_utf8_lossy(&bytes);
                   let mut deltas = Vec::new();
                   let mut current_event = String::new();
                   
                   for line in text.split('\n') {
                       if line.starts_with("event: ") {
                           current_event = line[7..].trim().to_string();
                       } else if line.starts_with("data: ") {
                           let data = line[6..].trim();
                           if let Ok(ev) = serde_json::from_str::<AnthropicEvent>(data) {
                               match ev {
                                   AnthropicEvent::ContentBlockDelta { delta: AnthropicDelta::TextDelta { text } } => {
                                       deltas.push(Ok(LlmResponse::TextDelta(text.clone())));
                                   },
                                   AnthropicEvent::MessageStop => {
                                       deltas.push(Ok(LlmResponse::Done));
                                   },
                                   _ => {}
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
