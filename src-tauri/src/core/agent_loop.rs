use tauri::ipc::Channel;
use futures::StreamExt;
use serde_json::Value;

use crate::shared::schema::ServerEventChunk;
use crate::core::models::{LlmClient, ChatMessage, LlmResponse, LlmToolDefinition};
use crate::core::tools::{AgentTool, shell::ShellTool, file_system::FileSystemTool};

pub struct AgentLoop {
    client: Box<dyn LlmClient>,
    tools: Vec<Box<dyn AgentTool>>,
}

impl AgentLoop {
    pub fn new(client: Box<dyn LlmClient>) -> Self {
        Self {
            client,
            tools: vec![
                Box::new(ShellTool),
                Box::new(FileSystemTool),
            ],
        }
    }

    pub async fn run_stream(
        &self,
        _session_id: String,
        prompt: String,
        on_event: Channel<ServerEventChunk>,
    ) -> Result<(), String> {
        let mut history = vec![
            ChatMessage {
                role: "user".to_string(),
                content: prompt,
                tool_calls: None,
                tool_call_id: None,
            }
        ];

        let tool_defs: Vec<LlmToolDefinition> = self.tools.iter().map(|t| {
            LlmToolDefinition {
                name: t.name().to_string(),
                description: t.description().to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {} // Simplified
                }),
            }
        }).collect();

        let mut thinking_ended = false;

        loop {
            let mut stream = self.client.chat_stream(history.clone(), tool_defs.clone()).await?;

            while let Some(res) = stream.next().await {
                match res {
                    Ok(LlmResponse::TextDelta(delta)) => {
                        if !thinking_ended {
                            let _ = on_event.send(ServerEventChunk::ThinkingEnd { time_cost_ms: 0 });
                            thinking_ended = true;
                        }
                        let _ = on_event.send(ServerEventChunk::TextDelta { content: delta });
                    },
                    Ok(LlmResponse::ThinkingEnd) => {
                        let _ = on_event.send(ServerEventChunk::ThinkingEnd { time_cost_ms: 0 });
                        thinking_ended = true;
                    },
                    Ok(LlmResponse::ToolCall(tool_call)) => {
                        if !thinking_ended {
                            let _ = on_event.send(ServerEventChunk::ThinkingEnd { time_cost_ms: 0 });
                            thinking_ended = true;
                        }
                        
                        let tool_name = tool_call.name.clone();
                        let tool_id = tool_call.id.clone();
                        let args: Value = serde_json::from_str(&tool_call.arguments).unwrap_or(Value::Null);

                        let _ = on_event.send(ServerEventChunk::ToolStart {
                            tool_id: tool_id.clone(),
                            tool_name: tool_name.clone(),
                            args: args.clone(),
                        });

                        // Execution
                        let mut found_tool = None;
                        for t in &self.tools {
                            if t.name() == tool_name {
                                found_tool = Some(t);
                                break;
                            }
                        }

                        let result = if let Some(t) = found_tool {
                             t.execute(args, &on_event).await.unwrap_or_else(|e| e)
                        } else {
                            format!("Error: Tool {} not found", tool_name)
                        };

                        let _ = on_event.send(ServerEventChunk::ToolEnd {
                            tool_id: tool_id.clone(),
                            exit_code: 0,
                        });

                        history.push(ChatMessage {
                            role: "assistant".to_string(),
                            content: "".to_string(),
                            tool_calls: Some(vec![tool_call.clone()]),
                            tool_call_id: None,
                        });

                        history.push(ChatMessage {
                            role: "tool".to_string(),
                            content: result,
                            tool_calls: None,
                            tool_call_id: Some(tool_id),
                        });

                        continue; // Should break inner loop and re-enter outer loop to call LLM again
                    },
                    Ok(LlmResponse::Done) => {
                         let _ = on_event.send(ServerEventChunk::Done);
                         return Ok(());
                    },
                    Err(e) => return Err(e),
                }
            }
            break;
        }

        Ok(())
    }
}
