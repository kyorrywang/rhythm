use crate::permissions::modes::PermissionMode;

/// Describes the capabilities and configuration of a single Agent type.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentDefinition {
    // ── Identity ──────────────────────────────────────────────────────────────
    /// Unique identifier / routing key (e.g. "worker", "explorer").
    pub name: String,
    /// Human-readable description of the agent's purpose.
    pub description: String,

    // ── Capability constraints ────────────────────────────────────────────────
    /// Explicit tool-allow list; `None` means all registered tools are available.
    pub tools: Option<Vec<String>>,
    /// Explicit tool-deny list.
    pub disallowed_tools: Option<Vec<String>>,
    /// Override the model for this agent type.
    pub model: Option<String>,
    /// Permission mode override.
    pub permission_mode: Option<PermissionMode>,
    /// Optional loop turn limit for this agent. None means unlimited.
    pub max_turns: Option<usize>,

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /// If `true`, the agent runs in the background and the Leader continues
    /// without waiting for completion.
    #[serde(default)]
    pub background: bool,

    // ── Metadata ─────────────────────────────────────────────────────────────
    /// Optional UI accent colour (CSS colour string).
    pub color: Option<String>,
    /// Routing key used by spawning tools to select this definition.
    #[serde(default = "default_general_purpose")]
    pub subagent_type: String,
    /// Origin of this definition.
    #[serde(default)]
    pub source: AgentDefinitionSource,
}

fn default_general_purpose() -> String {
    "general-purpose".to_string()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentDefinitionSource {
    #[default]
    Builtin,
    User,
}

// ─── Built-in agent definitions ──────────────────────────────────────────────

/// Returns the set of pre-configured agent types available without any user
/// configuration.
pub fn builtin_agents() -> Vec<AgentDefinition> {
    vec![
        AgentDefinition {
            name: "general-purpose".to_string(),
            description: "General-purpose coding agent with access to all tools.".to_string(),
            tools: None,
            disallowed_tools: None,
            model: None,
            permission_mode: None,
            max_turns: None,
            background: false,
            color: None,
            subagent_type: "general-purpose".to_string(),
            source: AgentDefinitionSource::Builtin,
        },
        AgentDefinition {
            name: "explorer".to_string(),
            description: "Read-only explorer agent. Ideal for codebase analysis (uses a faster, cheaper model).".to_string(),
            tools: Some(vec![
                "read".to_string(),
                "shell".to_string(),  // for grep/find/ls
                "skill".to_string(),
            ]),
            disallowed_tools: Some(vec![
                "write".to_string(),
                "edit".to_string(),
                "delete".to_string(),
            ]),
            model: None, // caller may override to a cheaper model
            permission_mode: Some(PermissionMode::Plan),
            max_turns: None,
            background: false,
            color: Some("#60a5fa".to_string()), // blue
            subagent_type: "explorer".to_string(),
            source: AgentDefinitionSource::Builtin,
        },
        AgentDefinition {
            name: "worker".to_string(),
            description: "Implementation worker: writes code, runs tests, commits changes.".to_string(),
            tools: None,
            disallowed_tools: None,
            model: None,
            permission_mode: Some(PermissionMode::FullAuto),
            max_turns: None,
            background: false,
            color: Some("#34d399".to_string()), // green
            subagent_type: "worker".to_string(),
            source: AgentDefinitionSource::Builtin,
        },
        AgentDefinition {
            name: "verifier".to_string(),
            description: "Verification agent: reviews work done by workers and emits VERDICT: PASS/FAIL/PARTIAL.".to_string(),
            tools: Some(vec!["read".to_string(), "shell".to_string()]),
            disallowed_tools: Some(vec![
                "write".to_string(),
                "edit".to_string(),
                "delete".to_string(),
            ]),
            model: None,
            permission_mode: Some(PermissionMode::Plan),
            max_turns: None,
            background: false,
            color: Some("#f472b6".to_string()), // pink
            subagent_type: "verifier".to_string(),
            source: AgentDefinitionSource::Builtin,
        },
    ]
}

/// Look up a built-in agent definition by `subagent_type` routing key.
pub fn get_builtin_agent(subagent_type: &str) -> Option<AgentDefinition> {
    builtin_agents()
        .into_iter()
        .find(|a| a.subagent_type == subagent_type)
}
