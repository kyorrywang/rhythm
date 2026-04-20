use tokio::time::{sleep, Duration};

use crate::runtime::conversation::interrupts;

use super::status::emit_runtime_status;

pub fn is_retryable_rate_limit_error(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("429")
        || normalized.contains("too many requests")
        || normalized.contains("rate limit")
}

pub fn is_retryable_transient_error(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    let transient_markers = [
        "connection reset",
        "connection aborted",
        "connection closed",
        "broken pipe",
        "timed out",
        "timeout",
        "temporarily unavailable",
        "temporary failure",
        "unexpected eof",
        "eof while",
        "stream ended unexpectedly",
        "network error",
        "transport error",
        "http2 error",
        "tls",
        "socket",
        "io error",
    ];
    transient_markers
        .iter()
        .any(|marker| normalized.contains(marker))
}

pub async fn wait_for_retry_or_interrupt(
    agent_id: &str,
    session_id: &str,
    attempt: u32,
    retry_at: u64,
    reason: Option<&str>,
    total_delay_ms: u64,
    auto_retry_delay_ms: u64,
    transient_retry_delay_ms: u64,
) -> bool {
    let mut remaining_ms = total_delay_ms;
    while remaining_ms > 0 {
        if interrupts::is_interrupted(session_id).await {
            interrupts::clear_interrupt(session_id).await;
            return true;
        }
        let step_ms = remaining_ms.min(250);
        sleep(Duration::from_millis(step_ms)).await;
        remaining_ms -= step_ms;
        if remaining_ms % 1_000 == 0 && remaining_ms > 0 {
            let seconds = (remaining_ms / 1_000) as u32;
            emit_runtime_status(
                agent_id,
                session_id,
                "backoff_waiting",
                reason,
                Some(attempt),
                Some(seconds),
                Some(retry_at),
                auto_retry_delay_ms,
                transient_retry_delay_ms,
            );
        }
    }
    if interrupts::is_interrupted(session_id).await {
        interrupts::clear_interrupt(session_id).await;
        return true;
    }
    false
}
