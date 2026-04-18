use std::collections::HashMap;
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::sync::{oneshot, Mutex};

use crate::shared::schema::AskResponse;

static ASK_WAITERS: OnceLock<Arc<Mutex<HashMap<String, oneshot::Sender<AskResponse>>>>> =
    OnceLock::new();

fn get_ask_waiters() -> Arc<Mutex<HashMap<String, oneshot::Sender<AskResponse>>>> {
    ASK_WAITERS
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone()
}

pub async fn set_ask_waiter(tool_id: String, sender: oneshot::Sender<AskResponse>) {
    let arc_waiters = get_ask_waiters();
    let mut waiters = arc_waiters.lock().await;
    waiters.insert(tool_id, sender);
}

pub async fn resume_ask(tool_id: &str, answer: AskResponse) -> Result<(), String> {
    let arc_waiters = get_ask_waiters();
    let mut waiters = arc_waiters.lock().await;
    if let Some(sender) = waiters.remove(tool_id) {
        let _ = sender.send(answer);
        Ok(())
    } else {
        Err(format!("No pending ask request found for tool {}", tool_id))
    }
}

pub async fn remove_ask_waiter(tool_id: &str) {
    let arc_waiters = get_ask_waiters();
    let mut waiters = arc_waiters.lock().await;
    waiters.remove(tool_id);
}
