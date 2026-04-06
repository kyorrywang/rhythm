use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CronJob {
    pub id: String,
    pub name: String,
    pub schedule: String,
    pub command: Option<String>,
    pub prompt: Option<String>,
    pub cwd: String,
    pub enabled: bool,
    pub created_at: f64,
    pub last_run: Option<f64>,
    pub next_run: Option<f64>,
    pub last_status: Option<CronRunStatus>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "status", content = "detail")]
pub enum CronRunStatus {
    Success,
    Failed { exit_code: i32, output: String },
    Running,
}

impl CronJob {
    pub fn new(
        name: String,
        schedule: String,
        command: Option<String>,
        prompt: Option<String>,
        cwd: String,
    ) -> Self {
        let now = chrono::Utc::now().timestamp_millis() as f64 / 1000.0;
        let next_run = compute_next_run(&schedule).ok();
        Self {
            id: uuid::Uuid::new_v4().to_string()[..8].to_string(),
            name,
            schedule,
            command,
            prompt,
            cwd,
            enabled: true,
            created_at: now,
            last_run: None,
            next_run,
            last_status: None,
        }
    }
}

pub fn validate_cron_expr(expr: &str) -> Result<(), String> {
    cron::Schedule::from_str(expr)
        .map(|_| ())
        .map_err(|e| format!("Invalid cron expression: {}", e))
}

pub fn compute_next_run(expr: &str) -> Result<f64, String> {
    use std::str::FromStr;
    let schedule =
        cron::Schedule::from_str(expr).map_err(|e| format!("Invalid cron expression: {}", e))?;
    schedule
        .upcoming(chrono::Utc)
        .next()
        .map(|dt| dt.timestamp_millis() as f64 / 1000.0)
        .ok_or_else(|| "No upcoming run time".to_string())
}
