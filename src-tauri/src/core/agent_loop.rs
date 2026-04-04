use tauri::ipc::Channel;
use futures::future::join_all;
use futures::StreamExt;
use serde_json::Value;

use crate::shared::schema::ServerEventChunk;
use crate::core::models::{ChatMessageBlock, LlmClient, ChatMessage, LlmResponse, LlmToolDefinition};
use crate::core::tools::{AgentTool, shell::ShellTool, file_system::FileSystemTool, ask::AskTool, subagent::SubagentTool, plan::PlanTool};
use crate::core::state;

pub struct AgentLoop {
    client: Box<dyn LlmClient>,
    tools: Vec<Box<dyn AgentTool>>,
}

struct ToolExecutionResult {
    tool_call_blocks: Vec<ChatMessageBlock>,
    tool_results: Vec<ChatMessageBlock>,
}

impl AgentLoop {
    pub fn new(client: Box<dyn LlmClient>) -> Self {
        Self {
            client,
            tools: vec![
                Box::new(ShellTool),
                Box::new(FileSystemTool),
                Box::new(PlanTool),
                Box::new(AskTool),
                Box::new(SubagentTool),
            ],
        }
    }

    pub async fn run_stream(
        &self,
        session_id: String,
        prompt: String,
        on_event: Channel<ServerEventChunk>,
    ) -> Result<(), String> {
        let mut history = vec![
            ChatMessage {
                role: "user".to_string(),
                blocks: vec![ChatMessageBlock::Text { text: prompt }],
            }
        ];

        let tool_defs: Vec<LlmToolDefinition> = self.tools.iter().map(|t| {
            LlmToolDefinition {
                name: t.name().to_string(),
                description: t.description().to_string(),
                parameters: t.parameters(),
            }
        }).collect();

        'outer: loop {
            let mut thinking_ended = false;
            let mut thinking_started_at: Option<std::time::Instant> = None;
            let mut pending_tool_calls = Vec::new();

            let mut stream = self.client.chat_stream(history.clone(), tool_defs.clone()).await?;

            while let Some(res) = stream.next().await {
                match res {
                    Ok(LlmResponse::ThinkingDelta(delta)) => {
                        if thinking_started_at.is_none() {
                            thinking_started_at = Some(std::time::Instant::now());
                        }
                        let _ = on_event.send(ServerEventChunk::ThinkingDelta { content: delta });
                    },
                    Ok(LlmResponse::TextDelta(delta)) => {
                        if !thinking_ended {
                            let elapsed = thinking_started_at.map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);
                            let _ = on_event.send(ServerEventChunk::ThinkingEnd { time_cost_ms: elapsed });
                            thinking_ended = true;
                        }
                        let _ = on_event.send(ServerEventChunk::TextDelta { content: delta });
                    },
                    Ok(LlmResponse::ThinkingEnd) => {
                        let elapsed = thinking_started_at.map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);
                        let _ = on_event.send(ServerEventChunk::ThinkingEnd { time_cost_ms: elapsed });
                        thinking_ended = true;
                    },
                    Ok(LlmResponse::ToolCall(tool_call)) => {
                        if !thinking_ended {
                            let elapsed = thinking_started_at.map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);
                            let _ = on_event.send(ServerEventChunk::ThinkingEnd { time_cost_ms: elapsed });
                            thinking_ended = true;
                        }
                        pending_tool_calls.push(tool_call);
                    },
                    Ok(LlmResponse::Done) => {
                         if !pending_tool_calls.is_empty() {
                             let result = self.execute_tools(
                                 &session_id,
                                 std::mem::take(&mut pending_tool_calls),
                                 &on_event,
                             ).await;

                             history.push(ChatMessage {
                                 role: "assistant".to_string(),
                                 blocks: result.tool_call_blocks,
                             });
                             history.push(ChatMessage {
                                 role: "user".to_string(),
                                 blocks: result.tool_results,
                             });

                             if state::is_interrupted(&session_id).await {
                                 state::clear_interrupt(&session_id).await;
                                 let _ = on_event.send(ServerEventChunk::Interrupted);
                                 return Ok(());
                             }

                             continue 'outer;
                         }
                         let _ = on_event.send(ServerEventChunk::Done);
                         return Ok(());
                    },
                    Err(e) => return Err(e),
                }
            }

            if !pending_tool_calls.is_empty() {
                let result = self.execute_tools(
                    &session_id,
                    std::mem::take(&mut pending_tool_calls),
                    &on_event,
                ).await;

                history.push(ChatMessage {
                    role: "assistant".to_string(),
                    blocks: result.tool_call_blocks,
                });
                history.push(ChatMessage {
                    role: "user".to_string(),
                    blocks: result.tool_results,
                });

                if state::is_interrupted(&session_id).await {
                    state::clear_interrupt(&session_id).await;
                    let _ = on_event.send(ServerEventChunk::Interrupted);
                    return Ok(());
                }

                continue 'outer;
            }
            break;
        }

        Ok(())
    }

    async fn execute_tools(
        &self,
        session_id: &str,
        tool_calls: Vec<crate::core::models::LlmToolCall>,
        on_event: &Channel<ServerEventChunk>,
    ) -> ToolExecutionResult {
        let tool_call_blocks: Vec<ChatMessageBlock> = tool_calls.iter().map(|tool_call| {
            let args: Value = serde_json::from_str(&tool_call.arguments).unwrap_or(Value::Null);
            ChatMessageBlock::ToolCall {
                id: tool_call.id.clone(),
                name: tool_call.name.clone(),
                arguments: args,
            }
        }).collect();

        let executions = tool_calls.iter().map(|tool_call| {
            let tool_name = tool_call.name.clone();
            let tool_id = tool_call.id.clone();
            let args: Value = serde_json::from_str(&tool_call.arguments).unwrap_or(Value::Null);
            let on_event = on_event.clone();
            let tools: Vec<&Box<dyn AgentTool>> = self.tools.iter().collect();

            async move {
                let _ = on_event.send(ServerEventChunk::ToolStart {
                    tool_id: tool_id.clone(),
                    tool_name: tool_name.clone(),
                    args: args.clone(),
                });

                let result = if let Some(tool) = tools.iter().find(|tool| tool.name() == tool_name) {
                    tool.execute(session_id, &tool_id, args, &on_event).await
                } else {
                    Err(format!("Error: Tool {} not found", tool_name))
                };

                let is_error = result.is_err();
                let content = result.unwrap_or_else(|e| e);

                let _ = on_event.send(ServerEventChunk::ToolEnd {
                    tool_id: tool_id.clone(),
                    exit_code: if is_error { 1 } else { 0 },
                });

                ChatMessageBlock::ToolResult {
                    tool_call_id: tool_id,
                    content,
                    is_error,
                }
            }
        });

        let tool_results = join_all(executions).await;

        ToolExecutionResult {
            tool_call_blocks,
            tool_results,
        }
    }
}
