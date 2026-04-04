use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ServerEventChunk {
    #[serde(rename = "text_delta")]
    TextDelta { 
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
    
    #[serde(rename = "done")]
    Done,
}
