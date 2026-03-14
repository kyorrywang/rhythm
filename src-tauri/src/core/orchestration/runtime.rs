use anyhow::Result;
use tauri::{Window, Emitter};
use serde_json::{json, Value};
use crate::core::models::ChatMessage;
use crate::core::agents::primary_agent::PrimaryAgent;
use crate::core::agents::base_agent::BaseAgent;
use crate::core::llm_client::LLMClient;
use crate::core::memory::session_store::SessionStore;
use crate::core::capabilities::workflow::workflow_capability::WorkflowCapability;
use crate::core::infra::config_manager::ConfigManager;
use crate::core::tool_use::builtin_io::register_builtin_io;

pub struct OrchestratorRuntime {
    config_manager: ConfigManager,
}

impl OrchestratorRuntime {
    pub fn new() -> Self {
        Self {
            config_manager: ConfigManager::new(),
        }
    }

    pub async fn handle_chat_stream(
        &self, 
        window: &Window, 
        session_id: &str, 
        message: &str, 
        workspace_path: &str
    ) -> Result<()> {
        let store = SessionStore::new(workspace_path);
        let config = self.config_manager.get_effective_config(Some(workspace_path));
        
        let api_key = config.get("llm_api_key").and_then(|v| v.as_str()).unwrap_or("dummy").to_string();
        let model = config.get("llm_model").and_then(|v| v.as_str()).unwrap_or("gpt-4o").to_string();
        let base_url = config.get("llm_base_url").and_then(|v| v.as_str()).map(|s| s.to_string());

        let llm = LLMClient::new(api_key, model, base_url);
        let base_agent = BaseAgent::new(llm);
        let mut primary_agent = PrimaryAgent::new(base_agent);

        // Register Builtin Tools
        register_builtin_io(&mut primary_agent.base.registry);

        // Load capabilities
        primary_agent.add_capability(Box::new(WorkflowCapability::new(workspace_path)));

        // Append user message
        store.append(session_id, ChatMessage::new("user", Some(message.to_string())))?;

        // Start ReAct loop
        loop {
            let mut history = store.load(session_id)?;
            
            // Inject capability prompts
            let prompts = primary_agent.get_capability_prompts(session_id);
            if !prompts.is_empty() {
                history.push(ChatMessage::new("system", Some(prompts.join("\n\n"))));
            }

            let (mut assistant_msg, tool_results) = primary_agent.base.run_step(&history).await?;
            
            // If no tool calls, we are done
            if assistant_msg.tool_calls.is_none() {
                if let Some(content) = assistant_msg.content.clone() {
                    window.emit("chat-chunk", &content)?;
                    store.append(session_id, assistant_msg)?;
                }
                break;
            }

            // Inject context into tool calls for execution (though handler already does it, we need it for visibility)
            if let Some(calls) = assistant_msg.tool_calls.as_mut() {
                for call in calls {
                    if let Some(args_str) = call.get_mut("function").and_then(|f| f.get_mut("arguments")) {
                        if let Ok(mut args) = serde_json::from_str::<Value>(args_str.as_str().unwrap_or("{}")) {
                            if let Some(obj) = args.as_object_mut() {
                                obj.insert("__session_id".to_string(), json!(session_id));
                                obj.insert("__workspace_path".to_string(), json!(workspace_path));
                            }
                            *args_str = json!(serde_json::to_string(&args).unwrap_or_default());
                        }
                    }
                }
            }

            // Emit metadata about tools
            window.emit("chat-metadata", json!({
                "type": "metadata",
                "session_id": session_id,
                "used_tools": tool_results.iter().map(|r| json!({
                    "name": r.name,
                    "ok": r.ok,
                    "output": r.output
                })).collect::<Vec<_>>()
            }))?;

            store.append(session_id, assistant_msg)?;

            for res in tool_results {
                let tool_msg = ChatMessage {
                    role: "tool".to_string(),
                    content: Some(res.output.to_string()),
                    created_at: chrono::Utc::now(),
                    tool_calls: None,
                    tool_call_id: Some(res.id),
                    name: Some(res.name),
                };
                store.append(session_id, tool_msg)?;
            }
        }

        window.emit("chat-done", ())?;
        Ok(())
    }
}
