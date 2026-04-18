use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// ─── Message types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageType {
    UserMessage,
    PermissionRequest,
    PermissionResponse,
    Shutdown,
    IdleNotification,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailboxMessage {
    pub id: String,
    pub message_type: MessageType,
    pub sender: String,
    pub recipient: String,
    pub payload: serde_json::Value,
    pub timestamp: f64,
    #[serde(default)]
    pub read: bool,
}

// ─── TeammateMailbox ──────────────────────────────────────────────────────────

/// File-system backed mailbox for one Agent.
///
/// Inbox path: `~/.rhythm/data/teams/{team}/agents/{agent_id}/inbox/`
pub struct TeammateMailbox {
    inbox_dir: PathBuf,
}

impl TeammateMailbox {
    pub fn new(teams_dir: &Path, team: &str, agent_id: &str) -> Self {
        Self {
            inbox_dir: teams_dir
                .join(team)
                .join("agents")
                .join(agent_id)
                .join("inbox"),
        }
    }

    /// Write a message atomically (tmp → rename).
    pub async fn write(
        &self,
        msg: MailboxMessage,
    ) -> Result<(), crate::shared::error::RhythmError> {
        std::fs::create_dir_all(&self.inbox_dir)
            .map_err(crate::shared::error::RhythmError::IoError)?;

        let filename = format!("{:.6}_{}.json", msg.timestamp, msg.id);
        let tmp_path = self.inbox_dir.join(format!("{}.tmp", filename));
        let final_path = self.inbox_dir.join(&filename);

        let json = serde_json::to_string_pretty(&msg)
            .map_err(|e| crate::shared::error::RhythmError::SerdeError(e.to_string()))?;

        // Write to .tmp first
        std::fs::write(&tmp_path, &json).map_err(crate::shared::error::RhythmError::IoError)?;
        // Atomic rename
        std::fs::rename(&tmp_path, &final_path)
            .map_err(crate::shared::error::RhythmError::IoError)?;

        Ok(())
    }

    /// Read messages from the inbox, optionally filtering to unread only.
    pub async fn read_all(&self, unread_only: bool) -> Vec<MailboxMessage> {
        let Ok(dir) = std::fs::read_dir(&self.inbox_dir) else {
            return vec![];
        };

        let mut messages: Vec<MailboxMessage> = dir
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()) != Some("json") {
                    return None;
                }
                let text = std::fs::read_to_string(&p).ok()?;
                let msg: MailboxMessage = serde_json::from_str(&text).ok()?;
                if unread_only && msg.read {
                    return None;
                }
                Some(msg)
            })
            .collect();

        // Sort by timestamp ascending
        messages.sort_by(|a, b| {
            a.timestamp
                .partial_cmp(&b.timestamp)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        messages
    }

    /// Mark a message as read by rewriting its JSON file.
    pub async fn mark_read(
        &self,
        message_id: &str,
    ) -> Result<(), crate::shared::error::RhythmError> {
        let Ok(dir) = std::fs::read_dir(&self.inbox_dir) else {
            return Ok(());
        };

        for entry in dir.flatten() {
            let p = entry.path();
            if p.extension().and_then(|x| x.to_str()) != Some("json") {
                continue;
            }
            let text = std::fs::read_to_string(&p).ok().unwrap_or_default();
            let mut msg: MailboxMessage = match serde_json::from_str(&text) {
                Ok(m) => m,
                Err(_) => continue,
            };
            if msg.id == message_id {
                msg.read = true;
                let json = serde_json::to_string_pretty(&msg)
                    .map_err(|e| crate::shared::error::RhythmError::SerdeError(e.to_string()))?;
                std::fs::write(&p, json).map_err(crate::shared::error::RhythmError::IoError)?;
                break;
            }
        }
        Ok(())
    }

    /// Remove all messages from the inbox.
    pub async fn clear(&self) -> Result<(), crate::shared::error::RhythmError> {
        if !self.inbox_dir.exists() {
            return Ok(());
        }
        for entry in std::fs::read_dir(&self.inbox_dir)
            .map_err(crate::shared::error::RhythmError::IoError)?
            .flatten()
        {
            let p = entry.path();
            if p.extension().and_then(|x| x.to_str()) == Some("json") {
                let _ = std::fs::remove_file(p);
            }
        }
        Ok(())
    }
}

// ─── Convenience constructors ─────────────────────────────────────────────────

pub fn make_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("{:x}", ts)
}

pub fn now_f64() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs_f64()
}

pub fn create_user_message(sender: &str, recipient: &str, content: &str) -> MailboxMessage {
    MailboxMessage {
        id: make_id(),
        message_type: MessageType::UserMessage,
        sender: sender.to_string(),
        recipient: recipient.to_string(),
        payload: serde_json::json!({ "content": content }),
        timestamp: now_f64(),
        read: false,
    }
}

pub fn create_shutdown_request(sender: &str, recipient: &str) -> MailboxMessage {
    MailboxMessage {
        id: make_id(),
        message_type: MessageType::Shutdown,
        sender: sender.to_string(),
        recipient: recipient.to_string(),
        payload: serde_json::Value::Null,
        timestamp: now_f64(),
        read: false,
    }
}

pub fn create_idle_notification(sender: &str, recipient: &str, summary: &str) -> MailboxMessage {
    MailboxMessage {
        id: make_id(),
        message_type: MessageType::IdleNotification,
        sender: sender.to_string(),
        recipient: recipient.to_string(),
        payload: serde_json::json!({ "summary": summary }),
        timestamp: now_f64(),
        read: false,
    }
}
