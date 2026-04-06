/// Result from a single hook execution.
#[derive(Debug, Clone)]
pub struct HookResult {
    pub hook_type: String,
    pub success: bool,
    pub output: String,
    pub blocked: bool,
    pub reason: String,
}

/// Aggregated result for all hooks on a single event.
#[derive(Debug, Clone, Default)]
pub struct AggregatedHookResult {
    pub results: Vec<HookResult>,
}

impl AggregatedHookResult {
    /// True if any hook in the batch requested a block.
    pub fn blocked(&self) -> bool {
        self.results.iter().any(|r| r.blocked)
    }

    /// The reason string from the first blocking hook.
    pub fn reason(&self) -> String {
        self.results
            .iter()
            .find(|r| r.blocked)
            .map(|r| if r.reason.is_empty() { r.output.clone() } else { r.reason.clone() })
            .unwrap_or_default()
    }
}
