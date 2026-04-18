use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::OnceLock;

static AGENT_REGISTRY: OnceLock<Mutex<InnerRegistry>> = OnceLock::new();

pub struct AgentMeta {
    pub agent_id: String,
    pub session_id: String,
    pub parent_agent_id: Option<String>,
    pub depth: u32,
    pub is_running: bool,
}

struct InnerRegistry {
    agents: HashMap<String, AgentMeta>,
    next_id: u64,
}

fn get_registry() -> &'static Mutex<InnerRegistry> {
    AGENT_REGISTRY.get_or_init(|| {
        Mutex::new(InnerRegistry {
            agents: HashMap::new(),
            next_id: 0,
        })
    })
}

pub fn register_agent(session_id: String, parent_agent_id: Option<String>, depth: u32) -> String {
    let mut reg = get_registry().lock().unwrap();
    let agent_id = format!("agent-{}-{}", reg.next_id, session_id);
    reg.next_id += 1;

    reg.agents.insert(
        agent_id.clone(),
        AgentMeta {
            agent_id: agent_id.clone(),
            session_id,
            parent_agent_id,
            depth,
            is_running: true,
        },
    );

    agent_id
}

pub fn unregister_agent(agent_id: &str) {
    let mut reg = get_registry().lock().unwrap();
    if let Some(meta) = reg.agents.get_mut(agent_id) {
        meta.is_running = false;
    }
    reg.agents.remove(agent_id);
}

pub fn get_agent_meta(agent_id: &str) -> Option<AgentMeta> {
    let reg = get_registry().lock().unwrap();
    reg.agents.get(agent_id).map(|a| AgentMeta {
        agent_id: a.agent_id.clone(),
        session_id: a.session_id.clone(),
        parent_agent_id: a.parent_agent_id.clone(),
        depth: a.depth,
        is_running: a.is_running,
    })
}

pub fn get_agent_depth(agent_id: &str) -> Option<u32> {
    let reg = get_registry().lock().unwrap();
    reg.agents.get(agent_id).map(|a| a.depth)
}

pub fn get_children(agent_id: &str) -> Vec<String> {
    let reg = get_registry().lock().unwrap();
    reg.agents
        .values()
        .filter(|a| a.parent_agent_id.as_deref() == Some(agent_id))
        .map(|a| a.agent_id.clone())
        .collect()
}

pub fn stop_agent(agent_id: &str) {
    let mut reg = get_registry().lock().unwrap();
    if let Some(meta) = reg.agents.get_mut(agent_id) {
        meta.is_running = false;
    }
}

pub fn is_agent_running(agent_id: &str) -> bool {
    let reg = get_registry().lock().unwrap();
    reg.agents
        .get(agent_id)
        .map(|a| a.is_running)
        .unwrap_or(false)
}

pub fn get_session_id_for_agent(agent_id: &str) -> Option<String> {
    let reg = get_registry().lock().unwrap();
    reg.agents.get(agent_id).map(|a| a.session_id.clone())
}
