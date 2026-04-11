use serde::{Deserialize, Serialize};
use serde_json::Value;

fn is_valid_selection_type(st: &str) -> bool {
    st == "single_with_input" || st == "multiple_with_input"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AskQuestion {
    pub question: String,
    pub options: Vec<String>,
    #[serde(rename = "selectionType")]
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
        if self.options.is_empty() {
            return Err("Ask questions require at least one option. Use 'single_with_input' or 'multiple_with_input'.".to_string());
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
    #[serde(rename = "eventId")]
    pub event_id: u64,
    pub timestamp: u64,
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
    ThinkingEnd,

    #[serde(rename = "tool_start")]
    ToolStart {
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        args: Value,
    },

    #[serde(rename = "tool_call_delta")]
    ToolCallDelta {
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "argumentsText")]
        arguments_text: String,
    },

    #[serde(rename = "tool_output")]
    ToolOutput {
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "logLine")]
        log_line: String,
    },

    #[serde(rename = "tool_result")]
    ToolResult {
        #[serde(rename = "toolId")]
        tool_id: String,
        result: String,
        #[serde(rename = "isError")]
        is_error: bool,
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
        title: String,
        question: String,
        options: Vec<String>,
        #[serde(rename = "selectionType")]
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
        #[serde(rename = "parentToolCallId")]
        parent_tool_call_id: String,
        #[serde(rename = "subSessionId")]
        sub_session_id: String,
        title: String,
        message: String,
        #[serde(rename = "startedAt")]
        started_at: u64,
    },

    #[serde(rename = "subagent_end")]
    SubagentEnd {
        #[serde(rename = "parentSessionId")]
        parent_session_id: String,
        #[serde(rename = "parentToolCallId")]
        parent_tool_call_id: String,
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

    #[serde(rename = "runtime_status")]
    RuntimeStatus {
        state: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
        message: String,
        attempt: u32,
        #[serde(rename = "retryInSeconds", skip_serializing_if = "Option::is_none")]
        retry_in_seconds: Option<u32>,
        #[serde(rename = "retryAt", skip_serializing_if = "Option::is_none")]
        retry_at: Option<u64>,
    },

    #[serde(rename = "heartbeat")]
    Heartbeat,

    #[serde(rename = "done")]
    Done,

    #[serde(rename = "interrupted")]
    Interrupted,

    #[serde(rename = "failed")]
    Failed,

    #[serde(rename = "usage_update")]
    UsageUpdate {
        #[serde(rename = "inputTokens")]
        input_tokens: u64,
        #[serde(rename = "outputTokens")]
        output_tokens: u64,
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
