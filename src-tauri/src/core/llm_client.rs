use async_openai::Client;
use async_openai::types::chat::{
    CreateChatCompletionRequestArgs,
    ChatCompletionRequestAssistantMessageArgs, ChatCompletionRequestMessage,
    ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestToolMessageArgs,
    ChatCompletionRequestUserMessageArgs,
};
use anyhow::{Result, anyhow};
use serde_json::{Value, json};
use crate::core::models::{ChatMessage, ToolCall};

pub struct LLMClient {
    client: Client<async_openai::config::OpenAIConfig>,
    model: String,
}

impl LLMClient {
    pub fn new(api_key: String, model: String, base_url: Option<String>) -> Self {
        let mut config = async_openai::config::OpenAIConfig::default()
            .with_api_key(api_key);
        if let Some(url) = base_url {
            config = config.with_api_base(url);
        }
        Self {
            client: Client::with_config(config),
            model,
        }
    }

    fn build_messages(&self, history: &[ChatMessage]) -> Result<Vec<ChatCompletionRequestMessage>> {
        let mut messages = vec![
            ChatCompletionRequestSystemMessageArgs::default()
                .content("你是桌面编排器助手。你可以正常聊天，也可以调用工具。")
                .build()?
                .into(),
        ];

        for msg in history {
            let req_msg: ChatCompletionRequestMessage = match msg.role.as_str() {
                "user" => ChatCompletionRequestUserMessageArgs::default()
                    .content(msg.content.clone().unwrap_or_default())
                    .build()?
                    .into(),
                "assistant" => {
                    let mut builder = ChatCompletionRequestAssistantMessageArgs::default();
                    if let Some(content) = &msg.content {
                        builder.content(content.clone());
                    }
                    builder.build()?.into()
                },
                "tool" => ChatCompletionRequestToolMessageArgs::default()
                    .content(msg.content.clone().unwrap_or_default())
                    .tool_call_id(msg.tool_call_id.clone().unwrap_or_default())
                    .build()?
                    .into(),
                _ => continue,
            };
            messages.push(req_msg);
        }
        Ok(messages)
    }

    pub async fn decide(&self, history: &[ChatMessage], _tools: Option<Vec<Value>>) -> Result<(Option<String>, Vec<ToolCall>)> {
        let messages = self.build_messages(history)?;
        let mut request_builder = CreateChatCompletionRequestArgs::default();
        request_builder
            .model(&self.model)
            .messages(messages);

        let response = self.client.chat().create(request_builder.build()?).await?;
        let choice = response.choices.first().ok_or_else(|| anyhow!("No choice in response"))?;
        
        let mut tool_calls = vec![];
        if let Some(calls) = &choice.message.tool_calls {
            for call in calls {
                // Since I cannot check the enum easily without compilation, 
                // I will try to use the most common field name or match.
                // In some versions of async-openai, it's an enum Function(ChatCompletionMessageToolCallChunk)
                // But for response message it should be the final call.
                // Let's try to serialize it to see what it is, or just use Value.
                let call_val = serde_json::to_value(call).unwrap_or(json!({}));
                if let (Some(id), Some(name)) = (call_val.get("id"), call_val.get("function").and_then(|f| f.get("name"))) {
                    tool_calls.push(ToolCall {
                        id: id.as_str().unwrap_or_default().to_string(),
                        name: name.as_str().unwrap_or_default().to_string(),
                        arguments: call_val.get("function").and_then(|f| f.get("arguments"))
                            .and_then(|a| serde_json::from_str(a.as_str().unwrap_or("{}")).ok())
                            .unwrap_or(json!({})),
                    });
                }
            }
        }

        Ok((choice.message.content.clone(), tool_calls))
    }
}
