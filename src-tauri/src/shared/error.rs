use std::fmt;

#[derive(Debug)]
pub enum RhythmError {
    LlmError(String),
    LlmErrorAfterToolExecution(String),
    ToolNotFound(String),
    PermissionDenied { tool: String, reason: String },
    AgentTurnLimitExceeded(usize),
    IoError(std::io::Error),
    ConfigError(String),
    DatabaseError(String),
    McpError(String),
    SerdeError(String),
    HookError(String),
    SchedulerError(String),
    PolicyViolation(String),
}

impl fmt::Display for RhythmError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RhythmError::LlmError(msg) => write!(f, "LLM error: {}", msg),
            RhythmError::LlmErrorAfterToolExecution(msg) => {
                write!(f, "LLM error after tool execution: {}", msg)
            }
            RhythmError::ToolNotFound(name) => write!(f, "Tool not found: {}", name),
            RhythmError::PermissionDenied { tool, reason } => {
                write!(f, "Permission denied for tool '{}': {}", tool, reason)
            }
            RhythmError::AgentTurnLimitExceeded(turns) => {
                write!(f, "Agent turn limit ({}) exceeded", turns)
            }
            RhythmError::IoError(e) => write!(f, "IO error: {}", e),
            RhythmError::ConfigError(msg) => write!(f, "Config error: {}", msg),
            RhythmError::DatabaseError(msg) => write!(f, "Database error: {}", msg),
            RhythmError::McpError(msg) => write!(f, "MCP error: {}", msg),
            RhythmError::SerdeError(msg) => write!(f, "Serialization error: {}", msg),
            RhythmError::HookError(msg) => write!(f, "Hook error: {}", msg),
            RhythmError::SchedulerError(msg) => write!(f, "Scheduler error: {}", msg),
            RhythmError::PolicyViolation(msg) => write!(f, "Policy violation: {}", msg),
        }
    }
}

impl From<std::io::Error> for RhythmError {
    fn from(e: std::io::Error) -> Self {
        RhythmError::IoError(e)
    }
}

impl From<serde_json::Error> for RhythmError {
    fn from(e: serde_json::Error) -> Self {
        RhythmError::SerdeError(e.to_string())
    }
}

impl From<String> for RhythmError {
    fn from(s: String) -> Self {
        RhythmError::LlmError(s)
    }
}

impl RhythmError {
    pub fn message(&self) -> String {
        match self {
            RhythmError::LlmError(message) | RhythmError::LlmErrorAfterToolExecution(message) => {
                message.clone()
            }
            other => other.to_string(),
        }
    }

    pub fn is_safe_to_retry(&self) -> bool {
        matches!(self, RhythmError::LlmError(_))
    }
}
