use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex};
use std::sync::OnceLock;

pub static ASK_WAITERS: OnceLock<Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>> = OnceLock::new();

fn get_ask_waiters() -> Arc<Mutex<HashMap<String, oneshot::Sender<String>>>> {
    ASK_WAITERS.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

pub async fn set_ask_waiter(session_id: String, sender: oneshot::Sender<String>) {
    let arc_waiters = get_ask_waiters();
    let mut waiters = arc_waiters.lock().await;
    waiters.insert(session_id, sender);
}

pub async fn resume_ask(session_id: &str, answer: String) -> Result<(), String> {
    let arc_waiters = get_ask_waiters();
    let mut waiters = arc_waiters.lock().await;
    if let Some(sender) = waiters.remove(session_id) {
        let _ = sender.send(answer);
        Ok(())
    } else {
        Err(format!("No pending ask request found for session {}", session_id))
    }
}

pub static INTERRUPT_FLAGS: OnceLock<Arc<Mutex<HashMap<String, bool>>>> = OnceLock::new();

fn get_interrupt_flags() -> Arc<Mutex<HashMap<String, bool>>> {
    INTERRUPT_FLAGS.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
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

static SESSION_TREE: OnceLock<Arc<Mutex<HashMap<String, Vec<String>>>>> = OnceLock::new();

fn get_session_tree() -> Arc<Mutex<HashMap<String, Vec<String>>>> {
    SESSION_TREE.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

pub async fn register_session_child(parent_session_id: String, child_session_id: String) {
    let tree = get_session_tree();
    let mut map = tree.lock().await;
    map.entry(parent_session_id).or_default().push(child_session_id);
}

pub async fn get_all_descendant_sessions(session_id: &str) -> Vec<String> {
    let tree = get_session_tree();
    let map = tree.lock().await;
    let mut result = Vec::new();
    collect_descendants(&map, session_id, &mut result);
    result
}

fn collect_descendants(tree: &HashMap<String, Vec<String>>, session_id: &str, acc: &mut Vec<String>) {
    if let Some(children) = tree.get(session_id) {
        for child in children {
            acc.push(child.clone());
            collect_descendants(tree, child, acc);
        }
    }
}

pub async fn unregister_session_tree(session_id: &str) {
    let tree = get_session_tree();
    let mut map = tree.lock().await;
    map.remove(session_id);
    for children in map.values_mut() {
        children.retain(|c| c != session_id);
    }
}
