use crate::infrastructure::database::Database;
use serde_json::Value;
use sqlx::Row;
use std::path::Path;

pub async fn list_sessions(cwd: &Path) -> Result<Vec<Value>, String> {
    let pool = open_pool(cwd).await?;
    ensure_schema(&pool).await?;

    let rows = sqlx::query("SELECT snapshot_json FROM sessions ORDER BY updated_at DESC, id ASC")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let snapshot: String = row.get("snapshot_json");
            serde_json::from_str(&snapshot).map_err(|e| e.to_string())
        })
        .collect()
}

pub async fn get_session(cwd: &Path, session_id: &str) -> Result<Option<Value>, String> {
    let pool = open_pool(cwd).await?;
    ensure_schema(&pool).await?;

    let row = sqlx::query("SELECT snapshot_json FROM sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    row.map(|row| {
        let snapshot: String = row.get("snapshot_json");
        serde_json::from_str(&snapshot).map_err(|e| e.to_string())
    })
    .transpose()
}

pub async fn save_session(cwd: &Path, session: Value) -> Result<Value, String> {
    let pool = open_pool(cwd).await?;
    ensure_schema(&pool).await?;

    let session_id = required_str(&session, "id")?;
    let title = optional_str(&session, "title").unwrap_or(session_id);
    let workspace_path = cwd.to_string_lossy().to_string();
    let parent_id = optional_str(&session, "parentId");
    let pinned = optional_bool(&session, "pinned") as i64;
    let archived = optional_bool(&session, "archived") as i64;
    let updated_at = optional_i64(&session, "updatedAt").unwrap_or_else(now_millis);
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

fn required_str<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    optional_str(value, key).ok_or_else(|| format!("Session is missing '{}'", key))
}

fn optional_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn optional_bool(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn optional_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|raw| {
        raw.as_i64()
            .or_else(|| raw.as_f64().map(|number| number as i64))
    })
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
