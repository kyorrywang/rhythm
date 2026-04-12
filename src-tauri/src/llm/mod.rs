use async_trait::async_trait;
use futures::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::pin::Pin;
use std::collections::HashSet;

use crate::infrastructure::config::{HistoryToolResultsMode, LlmConfig};

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
    ToolCallDelta(LlmToolCall),
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

use anthropic::AnthropicClient;
use openai::OpenAiClient;

pub fn apply_history_replay_policy(
    config: &LlmConfig,
    messages: Vec<ChatMessage>,
) -> Vec<ChatMessage> {
    let mode = config
        .capabilities
        .history_tool_results
        .unwrap_or(HistoryToolResultsMode::Preserve);

    match mode {
        HistoryToolResultsMode::Preserve => messages,
        HistoryToolResultsMode::Drop => messages
            .into_iter()
            .map(|message| ChatMessage {
                role: message.role,
                blocks: message
                    .blocks
                    .into_iter()
                    .filter(|block| !matches!(block, ChatMessageBlock::ToolResult { .. }))
                    .collect(),
            })
            .collect(),
        HistoryToolResultsMode::AllowList => {
            let allowed_tools: HashSet<&str> = config
                .capabilities
                .history_tool_result_tools
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .map(String::as_str)
                .collect();

            messages
                .into_iter()
                .map(|message| {
                    let allowed_ids: HashSet<String> = message
                        .blocks
                        .iter()
                        .filter_map(|block| match block {
                            ChatMessageBlock::ToolCall { id, name, .. }
                                if allowed_tools.contains(name.as_str()) =>
                            {
                                Some(id.clone())
                            }
                            _ => None,
                        })
                        .collect();

                    ChatMessage {
                        role: message.role,
                        blocks: message
                            .blocks
                            .into_iter()
                            .filter(|block| match block {
                                ChatMessageBlock::ToolResult { tool_call_id, .. } => {
                                    allowed_ids.contains(tool_call_id)
                                }
                                _ => true,
                            })
                            .collect(),
                    }
                })
                .collect()
        }
    }
}

pub fn create_client(config: &LlmConfig) -> Box<dyn LlmClient> {
    match config.provider.to_lowercase().as_str() {
        "anthropic" => Box::new(AnthropicClient::new(config.clone())),
        _ => Box::new(OpenAiClient::new(config.clone())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::config::{HistoryToolResultsMode, ModelCapabilities};
    use serde_json::json;

    fn sample_config(mode: HistoryToolResultsMode, tools: Option<Vec<&str>>) -> LlmConfig {
        LlmConfig {
            name: "test".to_string(),
            provider: "anthropic".to_string(),
            base_url: "https://example.com".to_string(),
            api_key: "key".to_string(),
            model: "model".to_string(),
            max_tokens: Some(1024),
            capabilities: ModelCapabilities {
                anthropic_extended_thinking: None,
                anthropic_beta_headers: None,
                history_tool_results: Some(mode),
                history_tool_result_tools: tools.map(|items| {
                    items.into_iter().map(|item| item.to_string()).collect()
                }),
            },
        }
    }

    fn sample_messages() -> Vec<ChatMessage> {
        vec![ChatMessage {
            role: "assistant".to_string(),
            blocks: vec![
                ChatMessageBlock::Text {
                    text: "working".to_string(),
                },
                ChatMessageBlock::ToolCall {
                    id: "tool-1".to_string(),
                    name: "list_dir".to_string(),
                    arguments: json!({ "path": "novels" }),
                },
                ChatMessageBlock::ToolResult {
                    tool_call_id: "tool-1".to_string(),
                    content: "[]".to_string(),
                    is_error: false,
                },
                ChatMessageBlock::ToolCall {
                    id: "tool-2".to_string(),
                    name: "write_file".to_string(),
                    arguments: json!({ "path": "novels/a.md" }),
                },
                ChatMessageBlock::ToolResult {
                    tool_call_id: "tool-2".to_string(),
                    content: "ok".to_string(),
                    is_error: false,
                },
            ],
        }]
    }

    #[test]
    fn drops_all_tool_results_when_configured() {
        let normalized = apply_history_replay_policy(
            &sample_config(HistoryToolResultsMode::Drop, None),
            sample_messages(),
        );

        assert_eq!(normalized.len(), 1);
        assert_eq!(normalized[0].blocks.len(), 3);
        assert!(
            normalized[0]
                .blocks
                .iter()
                .all(|block| !matches!(block, ChatMessageBlock::ToolResult { .. }))
        );
    }

    #[test]
    fn keeps_only_allow_listed_tool_results_when_configured() {
        let normalized = apply_history_replay_policy(
            &sample_config(HistoryToolResultsMode::AllowList, Some(vec!["list_dir"])),
            sample_messages(),
        );

        assert_eq!(normalized.len(), 1);
        assert_eq!(normalized[0].blocks.len(), 4);
        assert!(normalized[0].blocks.iter().any(|block| matches!(
            block,
            ChatMessageBlock::ToolResult { tool_call_id, .. } if tool_call_id == "tool-1"
        )));
        assert!(!normalized[0].blocks.iter().any(|block| matches!(
            block,
            ChatMessageBlock::ToolResult { tool_call_id, .. } if tool_call_id == "tool-2"
        )));
    }
}
