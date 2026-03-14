use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: Option<String>,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl ChatMessage {
    pub fn new(role: &str, content: Option<String>) -> Self {
        Self {
            role: role.to_string(),
            content,
            created_at: Utc::now(),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolResult {
    pub id: String,
    pub name: String,
    pub ok: bool,
    pub output: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FlowStep {
    pub name: String,
    pub instruction: String,
    pub completion_condition: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FlowTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub steps: Vec<FlowStep>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FlowInstance {
    pub id: String,
    pub session_id: String,
    pub template_id: String,
    pub workspace_path: String,
    pub current_step_index: usize,
    pub state: String, // PENDING, RUNNING, WAITING_FOR_USER, PAUSED, COMPLETED, FAILED
    pub context_data: HashMap<String, Value>,
    pub pending_question: Option<String>,
    pub required_keys: Vec<String>,
}
