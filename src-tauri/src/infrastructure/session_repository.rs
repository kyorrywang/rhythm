use crate::infrastructure::database::Database;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallSnapshot {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
    pub raw_arguments: Option<String>,
    pub is_preparing: Option<bool>,
    pub result: Option<String>,
    pub status: String,
    pub logs: Option<Vec<String>>,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub sub_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSnapshot {
    pub id: String,
    pub text: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskQuestionSnapshot {
    pub question: String,
    pub options: Vec<String>,
    pub selection_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequestSnapshot {
    pub tool_id: String,
    pub tool_name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MessageSegmentSnapshot {
    #[serde(rename = "thinking")]
    Thinking {
        content: String,
        is_live: Option<bool>,
        started_at: Option<i64>,
        ended_at: Option<i64>,
    },
    #[serde(rename = "tool")]
    Tool { tool: ToolCallSnapshot },
    #[serde(rename = "ask")]
    Ask {
        tool_id: String,
        title: String,
        question: String,
        options: Vec<String>,
        selection_type: String,
        questions: Option<Vec<AskQuestionSnapshot>>,
        status: String,
        answer: Option<AskAnswerSnapshot>,
        started_at: Option<i64>,
        ended_at: Option<i64>,
    },
    #[serde(rename = "tasks")]
    Tasks {
        tasks: Vec<TaskSnapshot>,
        started_at: Option<i64>,
        ended_at: Option<i64>,
    },
    #[serde(rename = "retry")]
    Retry {
        state: String,
        reason: Option<String>,
        message: String,
        attempt: i64,
        retry_at: Option<i64>,
        retry_in_seconds: Option<i64>,
        updated_at: i64,
    },
    #[serde(rename = "text")]
    Text { content: String },
    #[serde(rename = "permission")]
    Permission {
        request: PermissionRequestSnapshot,
        status: String,
        started_at: Option<i64>,
        ended_at: Option<i64>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AskAnswerSnapshot {
    pub selected: Vec<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentSnapshot {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub mime_type: String,
    pub size: i64,
    pub data_url: Option<String>,
    pub preview_url: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSnapshot {
    pub id: String,
    pub role: String,
    pub content: Option<String>,
    pub attachments: Option<Vec<AttachmentSnapshot>>,
    pub mode: Option<String>,
    pub slash_command_name: Option<String>,
    pub context_policy: Option<String>,
    pub model: Option<String>,
    pub created_at: i64,
    pub segments: Option<Vec<MessageSegmentSnapshot>>,
    pub status: Option<String>,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedMessageSnapshot {
    pub id: String,
    pub message: MessageSnapshot,
    pub mode: Option<String>,
    pub priority: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshotDto {
    pub input_tokens: i64,
    pub output_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamRuntimeSnapshot {
    pub state: String,
    pub reason: Option<String>,
    pub message: Option<String>,
    pub attempt: Option<i64>,
    pub retry_at: Option<i64>,
    pub retry_in_seconds: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentResultSnapshot {
    pub result: String,
    pub is_error: bool,
    pub ended_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub id: String,
    pub title: String,
    pub updated_at: i64,
    pub workspace_path: Option<String>,
    #[serde(default)]
    pub messages: Vec<MessageSnapshot>,
    pub pinned: Option<bool>,
    pub archived: Option<bool>,
    pub has_unread_completed: Option<bool>,
    pub task_dock_minimized: Option<bool>,
    pub append_dock_minimized: Option<bool>,
    pub parent_id: Option<String>,
    pub queued_messages: Option<Vec<QueuedMessageSnapshot>>,
    pub queue_state: Option<String>,
    pub usage: Option<UsageSnapshotDto>,
    pub token_count: Option<i64>,
    pub permission_grants: Option<Vec<String>>,
    pub subagent_result: Option<SubagentResultSnapshot>,
    pub runtime: Option<StreamRuntimeSnapshot>,
    pub error: Option<String>,
}

fn sanitize_message(mut message: MessageSnapshot) -> MessageSnapshot {
    if message.role == "assistant" {
        message.content = None;
    }
    message
}

pub fn sanitize_session(mut session: SessionSnapshot) -> SessionSnapshot {
    session.messages = session
        .messages
        .into_iter()
        .map(sanitize_message)
        .collect();
    session.queued_messages = Some(
        session
            .queued_messages
            .unwrap_or_default()
            .into_iter()
            .map(|queued| QueuedMessageSnapshot {
                message: sanitize_message(queued.message),
                ..queued
            })
            .collect(),
    );
    session
}

pub async fn list_sessions(cwd: &Path) -> Result<Vec<SessionSnapshot>, String> {
    let pool = open_pool(cwd).await?;
    ensure_schema(&pool).await?;

    let rows = sqlx::query("SELECT snapshot_json FROM sessions ORDER BY updated_at DESC, id ASC")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();

    for row in rows {
        let snapshot: String = row.get("snapshot_json");
        match serde_json::from_str::<SessionSnapshot>(&snapshot) {
            Ok(session) => sessions.push(sanitize_session(session)),
            Err(error) => {
                eprintln!("Skipping invalid session snapshot while listing sessions: {}", error);
            }
        }
    }

    Ok(sessions)
}

pub async fn get_session(cwd: &Path, session_id: &str) -> Result<Option<SessionSnapshot>, String> {
    let pool = open_pool(cwd).await?;
    ensure_schema(&pool).await?;

    let row = sqlx::query("SELECT snapshot_json FROM sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    row.map(|row| {
        let snapshot: String = row.get("snapshot_json");
        match serde_json::from_str::<SessionSnapshot>(&snapshot) {
            Ok(session) => Ok(Some(sanitize_session(session))),
            Err(error) => {
                eprintln!(
                    "Skipping invalid session snapshot for session '{}': {}",
                    session_id,
                    error
                );
                Ok(None)
            }
        }
    })
    .transpose()
    .map(|maybe| maybe.flatten())
}

pub async fn save_session(cwd: &Path, session: SessionSnapshot) -> Result<SessionSnapshot, String> {
    let pool = open_pool(cwd).await?;
    ensure_schema(&pool).await?;

    let session = sanitize_session(session);
    let session_id = session.id.as_str();
    let title = session.title.as_str();
    let workspace_path = cwd.to_string_lossy().to_string();
    let parent_id = session.parent_id.as_deref();
    let pinned = session.pinned.unwrap_or(false) as i64;
    let archived = session.archived.unwrap_or(false) as i64;
    let updated_at = session.updated_at;
    let snapshot_json = serde_json::to_string(&session).map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        INSERT INTO sessions (
            id, workspace_path, title, parent_id, pinned, archived, created_at, updated_at, snapshot_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            workspace_path = excluded.workspace_path,
            title = excluded.title,
            parent_id = excluded.parent_id,
            pinned = excluded.pinned,
            archived = excluded.archived,
            updated_at = excluded.updated_at,
            snapshot_json = excluded.snapshot_json
        "#,
    )
    .bind(session_id)
    .bind(workspace_path)
    .bind(title)
    .bind(parent_id)
    .bind(pinned)
    .bind(archived)
    .bind(updated_at)
    .bind(updated_at)
    .bind(snapshot_json)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(session)
}

pub async fn delete_session(cwd: &Path, session_id: &str) -> Result<bool, String> {
    let pool = open_pool(cwd).await?;
    ensure_schema(&pool).await?;

    let result = sqlx::query(
        r#"
        WITH RECURSIVE descendants(id) AS (
            SELECT id FROM sessions WHERE id = ?
            UNION ALL
            SELECT sessions.id
            FROM sessions
            INNER JOIN descendants ON sessions.parent_id = descendants.id
        )
        DELETE FROM sessions
        WHERE id IN (SELECT id FROM descendants)
        "#,
    )
        .bind(session_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() > 0)
}

async fn open_pool(cwd: &Path) -> Result<sqlx::SqlitePool, String> {
    let db = Database::init_for_workspace(cwd)
        .await
        .map_err(|e| e.to_string())?;
    db.pool
        .ok_or_else(|| "Database pool is unavailable".to_string())
}

async fn ensure_schema(pool: &sqlx::SqlitePool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            workspace_path TEXT NOT NULL,
            title TEXT NOT NULL,
            parent_id TEXT,
            pinned INTEGER NOT NULL DEFAULT 0,
            archived INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            snapshot_json TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_parent_id ON sessions(parent_id)")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
