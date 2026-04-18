use std::sync::OnceLock;

use crate::domains::cron::types::validate_cron_expr;
use crate::domains::cron::{CronJob, CronRunner, SharedRegistry};

static CRON_REGISTRY: OnceLock<SharedRegistry> = OnceLock::new();

pub fn init_registry(registry: SharedRegistry) {
    let _ = CRON_REGISTRY.set(registry);
}

fn get_shared_registry() -> SharedRegistry {
    CRON_REGISTRY
        .get()
        .expect("Cron registry not initialized")
        .clone()
}

#[tauri::command]
pub fn cron_list() -> Result<Vec<CronJob>, String> {
    let registry = get_shared_registry();
    let reg = registry.lock().map_err(|e| e.to_string())?;
    Ok(reg.list().into_iter().cloned().collect())
}

#[tauri::command]
pub fn cron_create(
    name: String,
    schedule: String,
    command: Option<String>,
    prompt: Option<String>,
    cwd: String,
) -> Result<CronJob, String> {
    if command.is_none() && prompt.is_none() {
        return Err("Either command or prompt must be provided".to_string());
    }
    if command.is_some() && prompt.is_some() {
        return Err("Only one of command or prompt can be provided".to_string());
    }
    validate_cron_expr(&schedule)?;

    let job = CronJob::new(name, schedule, command, prompt, cwd);
    let registry = get_shared_registry();
    let mut reg = registry.lock().map_err(|e| e.to_string())?;
    let created = reg.create(job).clone();
    Ok(created)
}

#[tauri::command]
pub fn cron_delete(id: String) -> Result<bool, String> {
    let registry = get_shared_registry();
    let mut reg = registry.lock().map_err(|e| e.to_string())?;
    Ok(reg.delete(&id))
}

#[tauri::command]
pub fn cron_toggle(id: String, enabled: bool) -> Result<CronJob, String> {
    let registry = get_shared_registry();
    let mut reg = registry.lock().map_err(|e| e.to_string())?;
    reg.toggle(&id, enabled)
        .ok_or_else(|| format!("Cron job '{}' not found", id))
}

#[tauri::command]
pub async fn cron_trigger(id: String) -> Result<String, String> {
    let registry = get_shared_registry();
    let job = {
        let mut reg = registry.lock().map_err(|e| e.to_string())?;
        reg.claim_job(&id)
            .ok_or_else(|| format!("Cron job '{}' not found or already running", id))?
    };

    let runner = CronRunner::new(registry);
    runner.run(&job).await;
    Ok(format!("Cron job '{}' triggered and completed", id))
}
