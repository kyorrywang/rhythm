use std::collections::HashMap;
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::sync::{oneshot, Mutex};

static PERMISSION_WAITERS: OnceLock<Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>> =
    OnceLock::new();

fn get_permission_waiters() -> Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>> {
    PERMISSION_WAITERS
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone()
}

pub async fn set_permission_waiter(tool_id: String, sender: oneshot::Sender<bool>) {
    let arc = get_permission_waiters();
    let mut waiters = arc.lock().await;
    waiters.insert(tool_id, sender);
}

pub async fn resolve_permission(tool_id: &str, approved: bool) -> Result<(), String> {
    let arc = get_permission_waiters();
    let mut waiters = arc.lock().await;
    if let Some(sender) = waiters.remove(tool_id) {
        let _ = sender.send(approved);
        Ok(())
    } else {
        Err(format!(
            "No pending permission request for tool_id '{}'",
            tool_id
        ))
    }
}
