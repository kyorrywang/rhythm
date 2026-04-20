use tokio::time::{sleep, Duration};

use crate::infra::config;

pub fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn resolve_delegation_target(
    settings: &config::RhythmSettings,
    target_id: &str,
) -> Option<config::AgentDefinitionConfig> {
    config::resolve_subagent_definition(settings, target_id)
}

pub async fn wait_for_subagent_interrupt(parent_session_id: &str, sub_session_id: &str) {
    loop {
        if crate::runtime::conversation::interrupts::is_interrupted(parent_session_id).await
            || crate::runtime::conversation::interrupts::is_interrupted(sub_session_id).await
        {
            return;
        }
        sleep(Duration::from_millis(50)).await;
    }
}
