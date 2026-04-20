use tokio::time::{sleep, Duration};

use crate::runtime::conversation::interrupts;

pub(super) async fn wait_for_interrupt(session_id: &str) {
    loop {
        if interrupts::is_interrupted(session_id).await {
            return;
        }
        sleep(Duration::from_millis(50)).await;
    }
}
