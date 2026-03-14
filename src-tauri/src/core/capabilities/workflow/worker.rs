use std::sync::Arc;
use anyhow::Result;
use serde_json::json;
use crate::core::agents::sub_agent::SubAgent;
use crate::core::llm_client::LLMClient;
use crate::core::capabilities::workflow::engine::WorkflowEngine;
use crate::core::tool_use::registry::ToolDefinition;
use crate::core::infra::config_manager::ConfigManager;

pub struct WorkflowWorker {
    engine: Arc<WorkflowEngine>,
}

impl WorkflowWorker {
    pub fn new(engine: Arc<WorkflowEngine>) -> Self {
        Self { engine }
    }

    pub async fn run_async(&self, instance_id: String) -> Result<()> {
        let engine = self.engine.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::tick(&engine, &instance_id).await {
                eprintln!("Workflow tick error: {}", e);
            }
        });
        Ok(())
    }

    async fn tick(engine: &WorkflowEngine, instance_id: &str) -> Result<()> {
        let mut inst = match engine.get_instance(instance_id)? {
            Some(i) => i,
            None => return Ok(()),
        };

        if inst.state != "RUNNING" {
            return Ok(());
        }

        let tpl = match engine.get_template(&inst.template_id)? {
            Some(t) => t,
            None => {
                inst.state = "FAILED".to_string();
                engine.save_instance(&inst)?;
                return Ok(());
            }
        };

        if inst.current_step_index >= tpl.steps.len() {
            inst.state = "COMPLETED".to_string();
            engine.save_instance(&inst)?;
            return Ok(());
        }

        let step = &tpl.steps[inst.current_step_index];
        
        // Variable interpolation
        let mut instruction = step.instruction.clone();
        for (k, v) in &inst.context_data {
            let placeholder = format!("{{{}}}", k);
            let val_str = v.as_str().unwrap_or(&v.to_string()).to_string();
            instruction = instruction.replace(&placeholder, &val_str);
        }

        let objective = format!(
            "正在执行流程【{}】的第 {}/{} 步：【{}】。\n指令：{}\n\n完成条件：{}\n\n【强制守则】\n1. 需要询问用户请调用 `workflow.subagent_ask_user`。\n2. 任务完成请调用 `workflow.subagent_finish_step`。",
            tpl.name, inst.current_step_index + 1, tpl.steps.len(), step.name, instruction, step.completion_condition.as_deref().unwrap_or("自行判断")
        );

        // Get LLM config
        let config_mgr = ConfigManager::new();
        let config = config_mgr.get_effective_config(Some(&inst.workspace_path));
        let api_key = config.get("llm_api_key").and_then(|v| v.as_str()).unwrap_or("dummy").to_string();
        let model = config.get("llm_model").and_then(|v| v.as_str()).unwrap_or("gpt-4o").to_string();
        let base_url = config.get("llm_base_url").and_then(|v| v.as_str()).map(|s| s.to_string());

        let llm = LLMClient::new(api_key, model, base_url);
        let mut sub_agent = SubAgent::new(llm, objective);

        // Register SubAgent specific tools
        sub_agent.base.registry.register(ToolDefinition {
            name: "workflow.subagent_ask_user".to_string(),
            description: "向用户提问并挂起流程".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "question": { "type": "string" },
                    "required_keys": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["question"]
            }),
            handler: Arc::new(move |_args| {
                Ok(json!("SUCCESS"))
            }),
        });

        sub_agent.base.registry.register(ToolDefinition {
            name: "workflow.subagent_finish_step".to_string(),
            description: "宣告本步骤完成并传递产出数据".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "output_data": { "type": "object" }
                }
            }),
            handler: Arc::new(move |_args| {
                Ok(json!("SUCCESS"))
            }),
        });

        // Run the agent step
        let tool_results = sub_agent.run().await?;
        
        // Check tool calls for state transitions
        for res in tool_results {
            if res.name == "workflow.subagent_ask_user" {
                inst.state = "WAITING_FOR_USER".to_string();
                inst.pending_question = res.output.get("question").and_then(|v| v.as_str()).map(|s| s.to_string());
                engine.save_instance(&inst)?;
                return Ok(());
            } else if res.name == "workflow.subagent_finish_step" {
                if let Some(data) = res.output.get("output_data").and_then(|v| v.as_object()) {
                    for (k, v) in data {
                        inst.context_data.insert(k.clone(), v.clone());
                    }
                }
                inst.current_step_index += 1;
                engine.save_instance(&inst)?;
                
                // Recurse to next step
                Box::pin(Self::tick(engine, instance_id)).await?;
                return Ok(());
            }
        }

        Ok(())
    }
}
