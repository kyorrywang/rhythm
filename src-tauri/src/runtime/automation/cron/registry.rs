use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::infra::paths::get_cron_registry_path;
use crate::runtime::automation::cron::types::{compute_next_run, CronJob};

pub struct CronRegistry {
    jobs: HashMap<String, CronJob>,
    registry_path: PathBuf,
}

impl CronRegistry {
    pub fn load() -> Self {
        let registry_path = get_cron_registry_path();
        let jobs = if registry_path.exists() {
            match std::fs::read_to_string(&registry_path) {
                Ok(content) => match serde_json::from_str(&content) {
                    Ok(jobs) => jobs,
                    Err(e) => {
                        eprintln!("Failed to parse cron registry: {}", e);
                        HashMap::new()
                    }
                },
                Err(e) => {
                    eprintln!("Failed to read cron registry: {}", e);
                    HashMap::new()
                }
            }
        } else {
            HashMap::new()
        };
        Self {
            jobs,
            registry_path,
        }
    }

    pub fn save(&self) -> Result<(), String> {
        if let Some(parent) = self.registry_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let content = serde_json::to_string_pretty(&self.jobs).map_err(|e| e.to_string())?;
        let tmp_path = self.registry_path.with_extension("json.tmp");
        std::fs::write(&tmp_path, &content).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp_path, &self.registry_path).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn create(&mut self, job: CronJob) -> &CronJob {
        let job_id = job.id.clone();
        self.jobs.insert(job_id.clone(), job);
        let _ = self.save();
        self.jobs.get(&job_id).unwrap()
    }

    pub fn delete(&mut self, id: &str) -> bool {
        if self.jobs.remove(id).is_some() {
            let _ = self.save();
            true
        } else {
            false
        }
    }

    pub fn toggle(&mut self, id: &str, enabled: bool) -> Option<CronJob> {
        if let Some(job) = self.jobs.get_mut(id) {
            job.enabled = enabled;
            if enabled {
                job.next_run = compute_next_run(&job.schedule).ok();
            } else {
                job.next_run = None;
            }
            let _ = self.save();
            self.jobs.get(id).cloned()
        } else {
            None
        }
    }

    pub fn list(&self) -> Vec<&CronJob> {
        self.jobs.values().collect()
    }

    pub fn get(&self, id: &str) -> Option<&CronJob> {
        self.jobs.get(id)
    }

    pub fn get_due_jobs(&self, now: chrono::DateTime<chrono::Utc>) -> Vec<CronJob> {
        let now_ts = now.timestamp_millis() as f64 / 1000.0;
        self.jobs
            .values()
            .filter(|job| {
                job.enabled
                    && job.next_run.is_some()
                    && job.next_run.unwrap() <= now_ts
                    && !matches!(
                        job.last_status,
                        Some(crate::runtime::automation::cron::types::CronRunStatus::Running)
                    )
            })
            .cloned()
            .collect()
    }

    pub fn claim_due_jobs(&mut self, now: chrono::DateTime<chrono::Utc>) -> Vec<CronJob> {
        let due_jobs = self.get_due_jobs(now);

        for job in &due_jobs {
            if let Some(stored) = self.jobs.get_mut(&job.id) {
                stored.last_status =
                    Some(crate::runtime::automation::cron::types::CronRunStatus::Running);
                stored.next_run = None;
            }
        }

        if !due_jobs.is_empty() {
            let _ = self.save();
        }

        due_jobs
    }

    pub fn claim_job(&mut self, id: &str) -> Option<CronJob> {
        let job = self.jobs.get(id).cloned()?;

        if matches!(
            job.last_status,
            Some(crate::runtime::automation::cron::types::CronRunStatus::Running)
        ) {
            return None;
        }

        if let Some(stored) = self.jobs.get_mut(id) {
            stored.last_status =
                Some(crate::runtime::automation::cron::types::CronRunStatus::Running);
            stored.next_run = None;
        }
        let _ = self.save();

        self.jobs.get(id).cloned()
    }

    pub fn update_after_run(
        &mut self,
        id: &str,
        last_run: f64,
        last_status: crate::runtime::automation::cron::types::CronRunStatus,
    ) {
        if let Some(job) = self.jobs.get_mut(id) {
            job.last_run = Some(last_run);
            job.last_status = Some(last_status);
            if job.enabled {
                job.next_run = compute_next_run(&job.schedule).ok();
            }
            let _ = self.save();
        }
    }
}

pub type SharedRegistry = Arc<Mutex<CronRegistry>>;
