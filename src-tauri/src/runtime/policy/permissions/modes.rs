/// The three permission modes that control tool execution policy.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    /// Default: read-only tools pass freely; write/exec tools require frontend confirmation.
    Default,
    /// Plan: blocks all mutating (non-read-only) tools to enforce read-only analysis.
    Plan,
    /// FullAuto: all tools execute without confirmation (automation/CI mode).
    FullAuto,
}

impl PermissionMode {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "plan" => Self::Plan,
            "full_auto" | "fullauto" => Self::FullAuto,
            _ => Self::Default,
        }
    }
}
