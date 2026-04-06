use std::collections::HashMap;
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::sync::Mutex;

static INTERRUPT_FLAGS: OnceLock<Arc<Mutex<HashMap<String, bool>>>> = OnceLock::new();

fn get_interrupt_flags() -> Arc<Mutex<HashMap<String, bool>>> {
    INTERRUPT_FLAGS
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone()
}

pub async fn request_interrupt(session_id: &str) -> bool {
    let flags = get_interrupt_flags();
    let mut map = flags.lock().await;
    map.insert(session_id.to_string(), true);
    true
}

pub async fn is_interrupted(session_id: &str) -> bool {
    let flags = get_interrupt_flags();
    let map = flags.lock().await;
    map.get(session_id).copied().unwrap_or(false)
}

pub async fn clear_interrupt(session_id: &str) {
    let flags = get_interrupt_flags();
    let mut map = flags.lock().await;
    map.remove(session_id);
}
