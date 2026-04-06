use sqlx::sqlite::SqlitePool;
use crate::infrastructure::paths;

pub struct Database {
    pub pool: Option<SqlitePool>,
}

impl Database {
    pub async fn init() -> Result<Self, sqlx::Error> {
        let db_path = paths::get_sessions_dir().join("rhythm.db");

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let db_url = format!("sqlite://{}", db_path.display());
        let pool = SqlitePool::connect(&db_url).await?;

        Ok(Database { pool: Some(pool) })
    }
}
