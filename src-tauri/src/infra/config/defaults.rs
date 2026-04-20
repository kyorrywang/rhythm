use crate::runtime::policy::permissions::modes::PermissionMode;

pub(super) fn default_llm_name() -> String {
    "Anthropic".to_string()
}

pub(super) fn default_llm_provider() -> String {
    "anthropic".to_string()
}

pub(super) fn default_allow() -> bool {
    true
}

pub(super) fn default_permission_mode() -> PermissionMode {
    PermissionMode::Default
}

pub(super) fn default_true() -> bool {
    true
}

pub(super) fn default_max_files() -> usize {
    5
}

pub(super) fn default_max_entrypoint_lines() -> usize {
    200
}

pub(super) fn default_timeout() -> u64 {
    30
}

pub(super) fn default_schema_version() -> u32 {
    2
}

pub(super) fn default_theme() -> String {
    "system".to_string()
}

pub(super) fn default_theme_preset() -> String {
    "grand".to_string()
}

pub(super) fn default_agent_id() -> String {
    "chat".to_string()
}

pub(super) fn default_reasoning() -> String {
    "medium".to_string()
}
