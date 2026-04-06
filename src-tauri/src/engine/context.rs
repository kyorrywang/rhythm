use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::hooks::executor::HookExecutor;
use crate::llm::LlmClient;
use crate::mcp::client::McpClientManager;
use crate::permissions::PermissionChecker;
use crate::tools::ToolRegistry;

/// All state shared across every turn of a single query (user message → final answer).
pub struct QueryContext {
    /// The LLM client to call.
    pub api_client: Arc<dyn LlmClient>,
    /// All registered tools.
    pub tool_registry: Arc<ToolRegistry>,
    /// Permission gate evaluated before each tool execution.
    pub permission_checker: Arc<PermissionChecker>,
    /// Optional hook executor (pre/post tool-use, session start/end).
    pub hook_executor: Option<Arc<HookExecutor>>,
    /// Optional MCP client manager for external tool servers.
    pub mcp_manager: Option<Arc<Mutex<McpClientManager>>>,
    /// Working directory for file-relative tool operations.
    pub cwd: PathBuf,
    /// LLM model name.
    pub model: String,
    /// Fully assembled system prompt (built by prompts::builder).
    pub system_prompt: String,
    /// Hard cap on agent turns to prevent infinite loops.
    pub max_turns: usize,
    /// Whether auto compaction is enabled for this query.
    pub auto_compact_enabled: bool,
    /// Maximum tokens per LLM response (used by AutoCompact threshold).
    pub max_tokens: u32,
    /// Fraction of max_tokens at which compaction should trigger.
    pub auto_compact_threshold_ratio: f32,
    /// Maximum number of micro-compacts before escalating to full LLM summary.
    pub max_micro_compacts: usize,
    /// Agent ID (for event_bus routing).
    pub agent_id: String,
    /// Session ID (for event_bus routing and state lookups).
    pub session_id: String,
}
