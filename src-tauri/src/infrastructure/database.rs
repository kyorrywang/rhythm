use sqlx::sqlite::SqlitePool;

pub struct Database {
    pub pool: Option<SqlitePool>,
}

impl Database {
    pub async fn init() -> Result<Self, sqlx::Error> {
        // Stub: initialize SQLite pool
        Ok(Database {
            pool: None
        })
    }
}
