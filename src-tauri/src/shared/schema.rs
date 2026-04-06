use serde::{Deserialize, Serialize};
use serde_json::Value;

fn default_selection_type() -> String {
    "multiple_with_input".to_string()
}

fn is_valid_selection_type(st: &str) -> bool {
    st == "single_with_input" || st == "multiple_with_input"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AskQuestion {
    pub question: String,
    pub options: Vec<String>,
    #[serde(rename = "selectionType", default = "default_selection_type")]
    pub selection_type: String,
}

impl AskQuestion {
    pub fn validate(&self) -> Result<(), String> {
        if !is_valid_selection_type(&self.selection_type) {
            return Err(format!(
                "Invalid selectionType '{}'. Only 'single_with_input' and 'multiple_with_input' are allowed.",
                self.selection_type
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub text: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerEventChunk {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(flatten)]
    pub payload: EventPayload,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum EventPayload {
    #[serde(rename = "text_delta")]
    TextDelta { content: String },

    #[serde(rename = "thinking_delta")]
    ThinkingDelta { content: String },

    #[serde(rename = "thinking_end")]
    ThinkingEnd {
        #[serde(rename = "timeCostMs")]
        time_cost_ms: u64,
    },

    #[serde(rename = "tool_start")]
    ToolStart {
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        args: Value,
    },

    #[serde(rename = "tool_output")]
    ToolOutput {
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "logLine")]
        log_line: String,
    },

    #[serde(rename = "tool_end")]
    ToolEnd {
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "exitCode")]
        exit_code: i32,
    },

    #[serde(rename = "ask_request")]
    AskRequest {
        #[serde(rename = "toolId")]
        tool_id: String,
        question: String,
        options: Vec<String>,
        #[serde(rename = "selectionType", default = "default_selection_type")]
        selection_type: String,
        #[serde(rename = "questions", default)]
        questions: Vec<AskQuestion>,
    },

    #[serde(rename = "task_update")]
    TaskUpdate { tasks: Vec<Task> },

    #[serde(rename = "subagent_start")]
    SubagentStart {
        #[serde(rename = "parentSessionId")]
        parent_session_id: String,
        #[serde(rename = "subSessionId")]
        sub_session_id: String,
        title: String,
        message: String,
    },

    #[serde(rename = "subagent_end")]
    SubagentEnd {
        #[serde(rename = "subSessionId")]
        sub_session_id: String,
        result: String,
        #[serde(rename = "isError")]
        is_error: bool,
    },

    #[serde(rename = "permission_request")]
    PermissionRequest {
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        reason: String,
    },

    #[serde(rename = "max_turns_exceeded")]
    MaxTurnsExceeded { turns: usize },

    #[serde(rename = "done")]
    Done,

    #[serde(rename = "interrupted")]
    Interrupted,

    #[serde(rename = "context_compacted")]
    ContextCompacted {
        #[serde(rename = "compactType")]
        compact_type: String,
        #[serde(rename = "tokensSaved")]
        tokens_saved: Option<usize>,
    },

    #[serde(rename = "cron_job_triggered")]
    CronJobTriggered {
        #[serde(rename = "jobId")]
        job_id: String,
        name: String,
    },

    #[serde(rename = "cron_job_completed")]
    CronJobCompleted {
        #[serde(rename = "jobId")]
        job_id: String,
        name: String,
        success: bool,
        output: String,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
}
