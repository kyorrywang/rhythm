use futures::future::join_all;
use futures::StreamExt;
use serde_json::Value;

use crate::shared::schema::EventPayload;
use crate::core::models::{ChatMessageBlock, LlmClient, ChatMessage, LlmResponse, LlmToolDefinition};
use crate::core::tools::{AgentTool, shell::ShellTool, ask::AskTool, subagent::SubagentTool, plan::PlanTool, read_file::ReadFileTool, write_file::WriteFileTool, edit_file::EditFileTool, delete_file::DeleteFileTool};
use crate::core::state;
use crate::core::event_bus;

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
                Box::new(ReadFileTool),
                Box::new(WriteFileTool),
                Box::new(EditFileTool),
                Box::new(DeleteFileTool),
                Box::new(PlanTool),
                Box::new(AskTool),
                Box::new(SubagentTool),
            ],
        }
    }

    pub async fn run_stream(
        &self,
        agent_id: &str,
        session_id: String,
        prompt: String,
        system_prompt: Option<String>,
    ) -> Result<String, String> {
        let mut history = Vec::new();
        let mut collected_text = String::new();

        if let Some(sys) = system_prompt {
            history.push(ChatMessage {
                role: "system".to_string(),
                blocks: vec![ChatMessageBlock::Text { text: sys }],
            });
        }

        history.push(ChatMessage {
            role: "user".to_string(),
            blocks: vec![ChatMessageBlock::Text { text: prompt }],
        });

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
                        event_bus::emit(agent_id, &session_id, EventPayload::ThinkingDelta { content: delta.clone() });
                        collected_text.push_str(&delta);
                    },
                    Ok(LlmResponse::TextDelta(delta)) => {
                        if !thinking_ended {
                            let elapsed = thinking_started_at.map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);
                            event_bus::emit(agent_id, &session_id, EventPayload::ThinkingEnd { time_cost_ms: elapsed });
                            thinking_ended = true;
                        }
                        event_bus::emit(agent_id, &session_id, EventPayload::TextDelta { content: delta.clone() });
                        collected_text.push_str(&delta);
                    },
                    Ok(LlmResponse::ThinkingEnd) => {
                        let elapsed = thinking_started_at.map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);
                        event_bus::emit(agent_id, &session_id, EventPayload::ThinkingEnd { time_cost_ms: elapsed });
                        thinking_ended = true;
                    },
                    Ok(LlmResponse::ToolCall(tool_call)) => {
                        if !thinking_ended {
                            let elapsed = thinking_started_at.map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);
                            event_bus::emit(agent_id, &session_id, EventPayload::ThinkingEnd { time_cost_ms: elapsed });
                            thinking_ended = true;
                        }
                        pending_tool_calls.push(tool_call);
                    },
                     Ok(LlmResponse::Done) => {
                          if !pending_tool_calls.is_empty() {
                              let result = self.execute_tools(
                                  agent_id,
                                  &session_id,
                                  std::mem::take(&mut pending_tool_calls),
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
                                  event_bus::emit(agent_id, &session_id, EventPayload::Interrupted);
                                  return Ok(collected_text);
                              }

                              continue 'outer;
                          }
                          event_bus::emit(agent_id, &session_id, EventPayload::Done);
                          return Ok(collected_text);
                     },
                    Err(e) => return Err(e),
                }
            }

            if !pending_tool_calls.is_empty() {
                let result = self.execute_tools(
                    agent_id,
                    &session_id,
                    std::mem::take(&mut pending_tool_calls),
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
                    event_bus::emit(agent_id, &session_id, EventPayload::Interrupted);
                    return Ok(collected_text);
                }

                continue 'outer;
            }
            break;
        }

        Ok(collected_text)
    }

    async fn execute_tools(
        &self,
        agent_id: &str,
        session_id: &str,
        tool_calls: Vec<crate::core::models::LlmToolCall>,
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
            let agent_id = agent_id.to_string();
            let session_id = session_id.to_string();
            let tools: Vec<&Box<dyn AgentTool>> = self.tools.iter().collect();

            async move {
                event_bus::emit(&agent_id, &session_id, EventPayload::ToolStart {
                    tool_id: tool_id.clone(),
                    tool_name: tool_name.clone(),
                    args: args.clone(),
                });

                let result = if let Some(tool) = tools.iter().find(|tool| tool.name() == tool_name) {
                    tool.execute(&agent_id, &session_id, &tool_id, args).await
                } else {
                    Err(format!("Error: Tool {} not found", tool_name))
                };

                let is_error = result.is_err();
                let content = result.unwrap_or_else(|e| e);

                event_bus::emit(&agent_id, &session_id, EventPayload::ToolEnd {
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
