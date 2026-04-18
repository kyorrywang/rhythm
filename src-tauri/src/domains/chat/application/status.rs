use crate::platform::event_bus;
use crate::shared::schema::EventPayload;

pub fn runtime_state_message(
    state: &str,
    reason: Option<&str>,
    attempt: u32,
    retry_in_seconds: Option<u32>,
    auto_retry_delay_ms: u64,
    transient_retry_delay_ms: u64,
) -> String {
    match state {
        "starting" => "正在启动会话流。".to_string(),
        "streaming" => "正在流式生成。".to_string(),
        "backoff_waiting" => match reason {
            Some("rate_limit") => format!(
                "429 Too Many Requests，第 {} 次自动重试将在 {} 秒后开始。",
                attempt.max(1),
                retry_in_seconds.unwrap_or((auto_retry_delay_ms / 1000) as u32)
            ),
            _ => format!(
                "连接暂时异常，第 {} 次自动重试将在 {} 秒后开始。",
                attempt.max(1),
                retry_in_seconds.unwrap_or((transient_retry_delay_ms / 1000) as u32)
            ),
        },
        "retrying" => format!("正在发起第 {} 次重试...", attempt.max(1)),
        "interrupted" => "会话已中断。".to_string(),
        "completed" => "会话已完成。".to_string(),
        "failed" => "会话失败。".to_string(),
        _ => "会话状态已更新。".to_string(),
    }
}

pub fn emit_runtime_status(
    agent_id: &str,
    session_id: &str,
    state: &str,
    reason: Option<&str>,
    attempt: Option<u32>,
    retry_in_seconds: Option<u32>,
    retry_at: Option<u64>,
    auto_retry_delay_ms: u64,
    transient_retry_delay_ms: u64,
) {
    let normalized_attempt = attempt.unwrap_or(0);
    event_bus::emit(
        agent_id,
        session_id,
        EventPayload::RuntimeStatus {
            state: state.to_string(),
            reason: reason.map(str::to_string),
            message: runtime_state_message(
                state,
                reason,
                normalized_attempt,
                retry_in_seconds,
                auto_retry_delay_ms,
                transient_retry_delay_ms,
            ),
            attempt: normalized_attempt,
            retry_in_seconds,
            retry_at,
        },
    );
}

pub fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
