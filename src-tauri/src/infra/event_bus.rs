use crate::shared::schema::{EventPayload, ServerEventChunk};
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::sync::OnceLock;
use tokio::sync::mpsc;

static EVENT_BUS: OnceLock<Mutex<InnerBus>> = OnceLock::new();

struct InnerBus {
    subscribers: HashMap<String, mpsc::UnboundedSender<ServerEventChunk>>,
    parent_child: HashMap<String, Vec<String>>,
    child_parent: HashMap<String, String>,
    ipc_channels: HashMap<String, tauri::ipc::Channel<ServerEventChunk>>,
    event_buffers: HashMap<String, VecDeque<ServerEventChunk>>,
    next_event_id: u64,
}

fn get_bus() -> &'static Mutex<InnerBus> {
    EVENT_BUS.get_or_init(|| {
        Mutex::new(InnerBus {
            subscribers: HashMap::new(),
            parent_child: HashMap::new(),
            child_parent: HashMap::new(),
            ipc_channels: HashMap::new(),
            event_buffers: HashMap::new(),
            next_event_id: 1,
        })
    })
}

pub fn register_ipc_channel(agent_id: &str, channel: tauri::ipc::Channel<ServerEventChunk>) {
    let mut bus = get_bus().lock().unwrap();
    bus.ipc_channels.insert(agent_id.to_string(), channel);
}

pub fn attach_ipc_channel(
    agent_id: &str,
    channel: tauri::ipc::Channel<ServerEventChunk>,
    after_event_id: Option<u64>,
) {
    let mut bus = get_bus().lock().unwrap();
    let buffered_events = bus.event_buffers.get(agent_id).cloned().unwrap_or_default();

    for chunk in buffered_events {
        if after_event_id.is_some_and(|value| chunk.event_id <= value) {
            continue;
        }
        let _ = channel.send(chunk);
    }

    bus.ipc_channels.insert(agent_id.to_string(), channel);
}

pub fn replay_buffered_events(
    agent_id: &str,
    channel: &tauri::ipc::Channel<ServerEventChunk>,
    after_event_id: Option<u64>,
) {
    let buffered_events = {
        let bus = get_bus().lock().unwrap();
        bus.event_buffers.get(agent_id).cloned().unwrap_or_default()
    };

    for chunk in buffered_events {
        if after_event_id.is_some_and(|value| chunk.event_id <= value) {
            continue;
        }
        let _ = channel.send(chunk);
    }
}

pub fn subscribe(agent_id: &str) -> mpsc::UnboundedReceiver<ServerEventChunk> {
    let (tx, rx) = mpsc::unbounded_channel();
    let mut bus = get_bus().lock().unwrap();
    bus.subscribers.insert(agent_id.to_string(), tx);
    rx
}

pub fn emit(agent_id: &str, session_id: &str, payload: EventPayload) {
    let (chunk, subscribers, ipcs, buffer_targets) = {
        let mut bus = get_bus().lock().unwrap();
        let event_id = bus.next_event_id;
        bus.next_event_id += 1;
        let chunk = ServerEventChunk {
            session_id: session_id.to_string(),
            event_id,
            timestamp: current_time_millis(),
            payload,
        };
        let mut subs = Vec::new();
        let mut buffer_targets = Vec::new();

        if let Some(tx) = bus.subscribers.get(agent_id) {
            subs.push(tx.clone());
        }
        buffer_targets.push(agent_id.to_string());

        let mut current = agent_id.to_string();
        while let Some(parent) = bus.child_parent.get(&current) {
            if let Some(tx) = bus.subscribers.get(parent.as_str()) {
                subs.push(tx.clone());
            }
            buffer_targets.push(parent.clone());
            current = parent.clone();
        }

        let mut ipc_list = Vec::new();
        if let Some(ch) = bus.ipc_channels.get(agent_id) {
            ipc_list.push(ch.clone());
        }
        let mut current2 = agent_id.to_string();
        while let Some(parent) = bus.child_parent.get(&current2) {
            if let Some(ch) = bus.ipc_channels.get(parent.as_str()) {
                ipc_list.push(ch.clone());
            }
            current2 = parent.clone();
        }

        (chunk, subs, ipc_list, buffer_targets)
    };

    {
        let mut bus = get_bus().lock().unwrap();
        for target in buffer_targets {
            let buffer = bus.event_buffers.entry(target).or_default();
            buffer.push_back(chunk.clone());
        }
    }

    for tx in subscribers {
        let _ = tx.send(chunk.clone());
    }
    for ch in ipcs {
        let _ = ch.send(chunk.clone());
    }
}

fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn register_child(parent_id: &str, child_id: &str) {
    let mut bus = get_bus().lock().unwrap();
    bus.parent_child
        .entry(parent_id.to_string())
        .or_default()
        .push(child_id.to_string());
    bus.child_parent
        .insert(child_id.to_string(), parent_id.to_string());
}

pub fn unregister(agent_id: &str) {
    let mut bus = get_bus().lock().unwrap();
    bus.subscribers.remove(agent_id);
    bus.ipc_channels.remove(agent_id);
    bus.event_buffers.remove(agent_id);

    if let Some(children) = bus.parent_child.remove(agent_id) {
        for child_id in children {
            bus.child_parent.remove(&child_id);
        }
    }

    if let Some(parent) = bus.child_parent.remove(agent_id) {
        if let Some(children) = bus.parent_child.get_mut(&parent) {
            children.retain(|c| c != agent_id);
        }
    }
}
