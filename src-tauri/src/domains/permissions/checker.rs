use super::modes::PermissionMode;
use crate::platform::config::PermissionConfig;
use fnmatch_regex::glob_to_regex;

/// The result of evaluating whether a tool call may proceed.
#[derive(Debug, Clone)]
pub struct PermissionDecision {
    /// Whether the tool is allowed to run.
    pub allowed: bool,
    /// If true the engine should ask the frontend for user confirmation before
    /// proceeding (only meaningful when `allowed` is false).
    pub requires_confirmation: bool,
    /// Human-readable explanation for logging / UI display.
    pub reason: String,
}

impl PermissionDecision {
    fn allow(reason: impl Into<String>) -> Self {
        Self {
            allowed: true,
            requires_confirmation: false,
            reason: reason.into(),
        }
    }

    fn deny(reason: impl Into<String>) -> Self {
        Self {
            allowed: false,
            requires_confirmation: false,
            reason: reason.into(),
        }
    }

    fn confirm(reason: impl Into<String>) -> Self {
        Self {
            allowed: false,
            requires_confirmation: true,
            reason: reason.into(),
        }
    }
}

/// Evaluates whether a tool invocation is permitted given the active settings.
pub struct PermissionChecker {
    mode: PermissionMode,
    allowed_tools: Vec<String>,
    denied_tools: Vec<String>,
    /// Compiled (pattern, allow) pairs for path-level rules.
    path_rules: Vec<(regex::Regex, bool)>,
    /// Pre-compiled regex patterns for denied commands.
    denied_command_patterns: Vec<regex::Regex>,
}

impl PermissionChecker {
    pub fn new(config: &PermissionConfig) -> Self {
        Self::new_with_mode(config, None)
    }

    pub fn new_with_mode(config: &PermissionConfig, mode_override: Option<PermissionMode>) -> Self {
        let mode = mode_override.unwrap_or_else(|| config.mode.clone());

        let path_rules = config
            .path_rules
            .iter()
            .filter_map(|rule| {
                if rule.pattern.trim().is_empty() {
                    return None;
                }
                match glob_to_regex(&rule.pattern) {
                    Ok(re) => Some((re, rule.allow)),
                    Err(_) => None,
                }
            })
            .collect();

        let denied_command_patterns = config
            .denied_commands
            .iter()
            .filter_map(|pattern| {
                if pattern.trim().is_empty() {
                    return None;
                }
                glob_to_regex(pattern).ok()
            })
            .collect();

        Self {
            mode,
            allowed_tools: config.allowed_tools.clone(),
            denied_tools: config.denied_tools.clone(),
            path_rules,
            denied_command_patterns,
        }
    }

    /// Evaluate whether the tool may run.
    ///
    /// Priority (first match wins):
    /// 1. Explicit deny list
    /// 2. Explicit allow list
    /// 3. Path rules (deny → block, allow → skip remaining checks)
    /// 4. Command deny patterns
    /// 5. FULL_AUTO → allow
    /// 6. Read-only tool → allow
    /// 7. PLAN mode → deny (mutating tool)
    /// 8. DEFAULT mode → needs confirmation (mutating tool)
    pub fn evaluate(
        &self,
        tool_name: &str,
        is_read_only: bool,
        file_path: Option<&str>,
        command: Option<&str>,
    ) -> PermissionDecision {
        // 1. Explicit deny list
        if self.denied_tools.iter().any(|d| d == tool_name) {
            return PermissionDecision::deny(format!("'{}' is explicitly denied", tool_name));
        }

        // 2. Explicit allow list
        if self.allowed_tools.iter().any(|a| a == tool_name) {
            return PermissionDecision::allow(format!("'{}' is explicitly allowed", tool_name));
        }

        // 3. Path rules — deny blocks, allow skips remaining checks
        if let Some(path) = file_path {
            for (re, allow) in &self.path_rules {
                if re.is_match(path) {
                    if *allow {
                        // Path is whitelisted — allow and skip further checks
                        return PermissionDecision::allow(format!(
                            "Path '{}' matches allow rule '{}'",
                            path,
                            re.as_str()
                        ));
                    } else {
                        return PermissionDecision::deny(format!(
                            "Path '{}' matches deny rule '{}'",
                            path,
                            re.as_str()
                        ));
                    }
                }
            }
        }

        // 4. Command deny patterns (pre-compiled)
        if let Some(cmd) = command {
            for re in &self.denied_command_patterns {
                if re.is_match(cmd) {
                    return PermissionDecision::deny(format!(
                        "Command matches deny pattern '{}'",
                        re.as_str()
                    ));
                }
            }
        }

        // 5. FULL_AUTO — allow everything
        if self.mode == PermissionMode::FullAuto {
            return PermissionDecision::allow("Full-auto mode allows all tools");
        }

        // 6. Read-only tools are always allowed
        if is_read_only {
            return PermissionDecision::allow("Read-only tools are always allowed");
        }

        // 7. PLAN mode blocks mutating tools
        if self.mode == PermissionMode::Plan {
            return PermissionDecision::deny(
                "Plan mode blocks mutating tools — exit plan mode first",
            );
        }

        // 8. DEFAULT mode — mutating tool needs user confirmation
        PermissionDecision::confirm(format!(
            "'{}' is a mutating tool — user confirmation required",
            tool_name
        ))
    }
}
