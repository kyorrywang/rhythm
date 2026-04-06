use std::collections::HashMap;
use std::sync::Arc;
use std::sync::OnceLock;
use tokio::sync::Mutex;

static SESSION_TREE: OnceLock<Arc<Mutex<HashMap<String, Vec<String>>>>> = OnceLock::new();

fn get_session_tree() -> Arc<Mutex<HashMap<String, Vec<String>>>> {
    SESSION_TREE
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone()
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

fn collect_descendants(
    tree: &HashMap<String, Vec<String>>,
    session_id: &str,
    acc: &mut Vec<String>,
) {
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
