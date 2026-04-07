use futures::StreamExt;
use serde::Deserialize;

use crate::infrastructure::config;
use crate::llm::{self, ChatMessage, ChatMessageBlock, LlmResponse};

#[derive(Debug, Deserialize)]
pub struct LlmCompleteMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn llm_complete(
    messages: Vec<LlmCompleteMessage>,
    provider_id: Option<String>,
    model: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    if messages.is_empty() {
        return Err("Cannot complete an empty message list".to_string());
    }

    let mut settings = config::load_settings();
    if let Some(provider_id) = provider_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if provider_id != settings.llm.name {
            return Err(format!(
                "Provider '{}' is not available in the active backend config '{}'",
                provider_id, settings.llm.name
            ));
        }
    }
    if let Some(model) = model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        settings.llm.model = model.to_string();
    }

    let chat_messages = messages
        .into_iter()
        .map(|message| ChatMessage {
            role: message.role,
            blocks: vec![ChatMessageBlock::Text {
                text: message.content,
            }],
        })
        .collect::<Vec<_>>();

    let client = llm::create_client(&settings.llm);
    tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs.unwrap_or(30)),
        async move {
            let mut stream = client.chat_stream(chat_messages, Vec::new()).await?;
            let mut content = String::new();

            while let Some(event) = stream.next().await {
                match event? {
                    LlmResponse::TextDelta(delta) => content.push_str(&delta),
                    LlmResponse::Done => break,
                    LlmResponse::ThinkingDelta(_)
                    | LlmResponse::ThinkingEnd
                    | LlmResponse::ToolCall(_) => {}
                }
            }

            Ok::<String, String>(content.trim().to_string())
        },
    )
    .await
    .map_err(|_| "LLM completion timed out".to_string())?
}
