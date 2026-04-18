use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::domains::chat::hooks::executor::HookExecutor;
use crate::domains::permissions::PermissionChecker;
use crate::domains::tools::ToolRegistry;
use crate::platform::config::{ResolvedCompletionPolicy, ResolvedDelegationPolicy};
use crate::platform::llm::LlmClient;
use crate::platform::mcp::client::McpClientManager;

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
    /// Provider ID or name selected for the current query.
    pub provider_id: String,
    /// LLM model name.
    pub model: String,
    /// Optional reasoning effort requested by the UI. Individual providers may map or ignore it.
    pub reasoning: Option<String>,
    /// Fully assembled system prompt (built by prompts::builder).
    pub system_prompt: String,
    /// Optional hard cap on agent turns. None means unlimited.
    pub agent_turn_limit: Option<usize>,
    /// Configured agent definition id for the current run.
    pub definition_id: String,
    /// Resolved delegation contract for this run.
    pub delegation: ResolvedDelegationPolicy,
    /// Resolved completion contract for this run.
    pub completion: ResolvedCompletionPolicy,
    /// Whether this specific task must delegate before completion.
    pub requires_delegation_for_completion: bool,
    /// Agent ID (for event_bus routing).
    pub agent_id: String,
    /// Session ID (for event_bus routing and state lookups).
    pub session_id: String,
}
