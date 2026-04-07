use crate::infrastructure::paths;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use std::path::Path;
use std::str::FromStr;

pub struct Database {
    pub pool: Option<SqlitePool>,
}

impl Database {
    pub async fn init() -> Result<Self, sqlx::Error> {
        let db_path = paths::get_sessions_dir().join("rhythm.db");
        Self::init_at_path(&db_path).await
    }

    pub async fn init_for_workspace(cwd: &Path) -> Result<Self, sqlx::Error> {
        let db_path = paths::get_workspace_sessions_db_path(cwd);
        Self::init_at_path(&db_path).await
    }

    async fn init_at_path(db_path: &Path) -> Result<Self, sqlx::Error> {
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let db_url = format!("sqlite://{}", db_path.display());
        let options = SqliteConnectOptions::from_str(&db_url)?.create_if_missing(true);
        let pool = SqlitePool::connect_with(options).await?;

        Ok(Database { pool: Some(pool) })
    }
}
