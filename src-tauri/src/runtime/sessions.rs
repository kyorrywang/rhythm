use std::collections::HashMap;
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::sync::Mutex;

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub agent_id: String,
    pub status: String,
    pub created_at: String,
}

static SESSION_REGISTRY: OnceLock<Arc<Mutex<HashMap<String, SessionInfo>>>> = OnceLock::new();

fn get_session_registry() -> Arc<Mutex<HashMap<String, SessionInfo>>> {
    SESSION_REGISTRY
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone()
}

pub async fn register_session(session_id: String, agent_id: String) {
    let registry = get_session_registry();
    let mut map = registry.lock().await;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    map.insert(
        session_id.clone(),
        SessionInfo {
            session_id,
            agent_id,
            status: "running".to_string(),
            created_at: format!("{}", now),
        },
    );
}

pub async fn unregister_session(session_id: String) {
    let registry = get_session_registry();
    let mut map = registry.lock().await;
    map.remove(&session_id);
}

pub async fn list_sessions() -> Vec<SessionInfo> {
    let registry = get_session_registry();
    let map = registry.lock().await;
    map.values().cloned().collect()
}

pub async fn get_session_info(session_id: &str) -> Option<SessionInfo> {
    let registry = get_session_registry();
    let map = registry.lock().await;
    map.get(session_id).cloned()
}
