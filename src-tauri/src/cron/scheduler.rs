use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use tokio::task::JoinHandle;

use crate::cron::registry::SharedRegistry;
use crate::cron::runner::CronRunner;

pub struct CronScheduler {
    registry: SharedRegistry,
    runner: Arc<CronRunner>,
}

impl CronScheduler {
    pub fn new(registry: SharedRegistry) -> Self {
        let runner = Arc::new(CronRunner::new(registry.clone()));
        Self { registry, runner }
    }

    pub fn start(&self) -> JoinHandle<()> {
        let registry = self.registry.clone();
        let runner = self.runner.clone();

        tokio::spawn(async move {
            loop {
                let now = Utc::now();
                let due_jobs = {
                    let mut reg = registry.lock().unwrap();
                    reg.claim_due_jobs(now)
                };

                for job in due_jobs {
                    let runner = runner.clone();
                    tokio::spawn(async move {
                        runner.run(&job).await;
                    });
                }

                tokio::time::sleep(Duration::from_secs(60)).await;
            }
        })
    }
}
