use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub text: String,
    pub status: String, // 'pending', 'running', 'completed', 'error'
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ServerEventChunk {
    #[serde(rename = "text_delta")]
    TextDelta { 
        content: String 
    },

    #[serde(rename = "thinking_delta")]
    ThinkingDelta {
        content: String
    },
    
    #[serde(rename = "thinking_end")]
    ThinkingEnd { 
        #[serde(rename = "timeCostMs")]
        time_cost_ms: u64 
    },
    
    #[serde(rename = "tool_start")]
    ToolStart { 
        #[serde(rename = "toolId")]
        tool_id: String, 
        #[serde(rename = "toolName")]
        tool_name: String, 
        args: Value 
    },
    
    #[serde(rename = "tool_output")]
    ToolOutput { 
        #[serde(rename = "toolId")]
        tool_id: String, 
        #[serde(rename = "logLine")]
        log_line: String 
    },
    
    #[serde(rename = "tool_end")]
    ToolEnd { 
        #[serde(rename = "toolId")]
        tool_id: String, 
        #[serde(rename = "exitCode")]
        exit_code: i32 
    },

    #[serde(rename = "ask_request")]
    AskRequest {
        #[serde(rename = "toolId")]
        tool_id: String,
        question: String,
        options: Vec<String>,
    },

    #[serde(rename = "task_update")]
    TaskUpdate {
        tasks: Vec<Task>
    },

    #[serde(rename = "subagent_start")]
    SubagentStart {
        #[serde(rename = "parentSessionId")]
        parent_session_id: String,
        #[serde(rename = "subSessionId")]
        sub_session_id: String,
        title: String,
    },
    
    #[serde(rename = "done")]
    Done,
}
