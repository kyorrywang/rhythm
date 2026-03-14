use std::sync::Arc;
use serde_json::json;
use crate::core::capabilities::Capability;
use crate::core::capabilities::workflow::engine::WorkflowEngine;
use crate::core::capabilities::workflow::worker::WorkflowWorker;
use crate::core::tool_use::registry::ToolDefinition;
use crate::core::models::{FlowStep, FlowTemplate};

pub struct WorkflowCapability {
    engine: Arc<WorkflowEngine>,
    worker: Arc<WorkflowWorker>,
}

impl WorkflowCapability {
    pub fn new(workspace_path: &str) -> Self {
        let engine = Arc::new(WorkflowEngine::new(workspace_path));
        let worker = Arc::new(WorkflowWorker::new(engine.clone()));
        Self { engine, worker }
    }
}

impl Capability for WorkflowCapability {
    fn get_tools(&self) -> Vec<ToolDefinition> {
        let engine = self.engine.clone();
        let worker = self.worker.clone();
        
        let mut tools = vec![];

        // workflow.create_template
        let engine_clone = engine.clone();
        tools.push(ToolDefinition {
            name: "workflow.create_template".to_string(),
            description: "创建 SOP 工作流模板 (YAML)".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "name": { "type": "string" },
                    "description": { "type": "string" },
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": { "type": "string" },
                                "instruction": { "type": "string" },
                                "completion_condition": { "type": "string" }
                            },
                            "required": ["name", "instruction"]
                        }
                    }
                },
                "required": ["id", "name", "steps"]
            }),
            handler: Arc::new(move |args| {
                let id = args.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let name = args.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let description = args.get("description").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let steps_raw = args.get("steps").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                
                let mut steps = vec![];
                for s in steps_raw {
                    steps.push(FlowStep {
                        name: s.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        instruction: s.get("instruction").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        completion_condition: s.get("completion_condition").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    });
                }

                let tpl = FlowTemplate { id, name, description, steps };
                engine_clone.save_template(&tpl)?;
                Ok(json!("ok"))
            }),
        });

        // workflow.list_templates
        let engine_clone = engine.clone();
        tools.push(ToolDefinition {
            name: "workflow.list_templates".to_string(),
            description: "列出当前工作区的所有工作流模板。".to_string(),
            parameters: json!({ "type": "object", "properties": {} }),
            handler: Arc::new(move |_args| {
                let templates = engine_clone.list_templates()?;
                Ok(json!(templates))
            }),
        });

        // workflow.start_flow
        let engine_clone = engine.clone();
        let worker_clone = worker.clone();
        tools.push(ToolDefinition {
            name: "workflow.start_flow".to_string(),
            description: "启动一个后台工作流实例。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "template_id": { "type": "string" }
                },
                "required": ["template_id"]
            }),
            handler: Arc::new(move |args| {
                let template_id = args.get("template_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("Missing template_id"))?;
                let session_id = args.get("__session_id").and_then(|v| v.as_str()).unwrap_or("default");
                let inst = engine_clone.create_instance(session_id, template_id)?;
                
                let inst_id = inst.id.clone();
                let worker_inner = worker_clone.clone();
                tokio::spawn(async move {
                    worker_inner.run_async(inst_id).await.ok();
                });

                Ok(json!({ "instance_id": inst.id, "status": "started" }))
            }),
        });

        // workflow.submit_flow_input
        let engine_clone = engine.clone();
        let worker_clone = worker.clone();
        tools.push(ToolDefinition {
            name: "workflow.submit_flow_input".to_string(),
            description: "向挂起的流程提交用户输入并恢复。".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "instance_id": { "type": "string" },
                    "input_data": { "type": "object" }
                },
                "required": ["instance_id", "input_data"]
            }),
            handler: Arc::new(move |args| {
                let instance_id = args.get("instance_id").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("Missing instance_id"))?;
                let input_data = args.get("input_data").and_then(|v| v.as_object()).ok_or_else(|| anyhow::anyhow!("Missing input_data"))?;
                
                let mut inst = engine_clone.get_instance(instance_id)?.ok_or_else(|| anyhow::anyhow!("Instance not found"))?;
                for (k, v) in input_data {
                    inst.context_data.insert(k.clone(), v.clone());
                }
                inst.state = "RUNNING".to_string();
                inst.pending_question = None;
                engine_clone.save_instance(&inst)?;
                
                let inst_id = inst.id.clone();
                let worker_inner = worker_clone.clone();
                tokio::spawn(async move {
                    worker_inner.run_async(inst_id).await.ok();
                });

                Ok(json!("ok"))
            }),
        });

        tools
    }

    fn get_system_prompts(&self, session_id: &str) -> Vec<String> {
        let mut prompts = vec![];
        if let Ok(instances) = self.engine.get_instances_for_session(session_id) {
            let waiting: Vec<_> = instances.into_iter().filter(|i| i.state == "WAITING_FOR_USER").collect();
            if !waiting.is_empty() {
                let mut msg = "【能力系统提示：后台工作流正在等待协作】\n当前有以下流程挂起，等待用户输入：\n".to_string();
                for i in waiting {
                    msg.push_str(&format!("- 实例ID: {}\n  需求: {}\n", i.id, i.pending_question.as_deref().unwrap_or("未知")));
                }
                msg.push_str("\n如果用户提供了信息，请调用 `workflow.submit_flow_input`。否则请引导用户回答。");
                prompts.push(msg);
            }
        }
        prompts
    }
}
