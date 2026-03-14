use anyhow::Result;
use crate::core::agents::base_agent::BaseAgent;
use crate::core::llm_client::LLMClient;
use crate::core::models::{ChatMessage, ToolResult};

pub struct SubAgent {
    pub base: BaseAgent,
    #[allow(dead_code)]
    pub objective: String,
    pub history: Vec<ChatMessage>,
    is_paused: bool,
}

impl SubAgent {
    pub fn new(llm: LLMClient, objective: String) -> Self {
        let system_msg = ChatMessage::new(
            "system",
            Some(format!(
                "你是独立运行的后台 SubAgent。\n这是你的专属执行空间，你不会看到用户日常的闲聊。\n你的核心目标是：\n{}",
                objective
            )),
        );
        Self {
            base: BaseAgent::new(llm),
            objective,
            history: vec![system_msg],
            is_paused: false,
        }
    }

    #[allow(dead_code)]
    pub fn pause(&mut self) {
        self.is_paused = true;
    }

    #[allow(dead_code)]
    pub fn resume(&mut self) {
        self.is_paused = false;
    }

    pub async fn run(&mut self) -> Result<Vec<ToolResult>> {
        if self.history.len() == 1 {
            self.history.push(ChatMessage::new("user", Some("请开始执行任务。".to_string())));
        }

        while !self.is_paused {
            let (assistant_msg, tool_results) = self.base.run_step(&self.history).await?;
            self.history.push(assistant_msg);

            if tool_results.is_empty() {
                // Task finished or no more tools
                return Ok(vec![]);
            }

            for res in &tool_results {
                let tool_msg = ChatMessage {
                    role: "tool".to_string(),
                    content: Some(res.output.to_string()),
                    created_at: chrono::Utc::now(),
                    tool_calls: None,
                    tool_call_id: Some(res.id.clone()),
                    name: Some(res.name.clone()),
                };
                self.history.push(tool_msg);
            }

            // If a tool modified is_paused, we break. 
            // In Rust, we usually handle this via return values or shared state.
            // For now, we return the last tool results to the caller (WorkflowWorker).
            return Ok(tool_results);
        }
        
        Ok(vec![])
    }
}
