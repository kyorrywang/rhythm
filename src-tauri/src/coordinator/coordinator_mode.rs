use std::collections::HashMap;

use super::agent_definition::AgentDefinition;

// ─── Coordinator mode detection ──────────────────────────────────────────────

/// Returns `true` when the current process is running as the Coordinator
/// (Leader) in a multi-agent team.  Detection is based on the environment
/// variable `RHYTHM_COORDINATOR_MODE=1`.
pub fn is_coordinator_mode() -> bool {
    std::env::var("RHYTHM_COORDINATOR_MODE")
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

/// Returns the agent ID of the current worker process, if any.
pub fn get_agent_id() -> Option<String> {
    std::env::var("RHYTHM_AGENT_ID")
        .ok()
        .filter(|s| !s.is_empty())
}

/// Returns the team name this process belongs to, if any.
pub fn get_team_name() -> Option<String> {
    std::env::var("RHYTHM_TEAM_NAME")
        .ok()
        .filter(|s| !s.is_empty())
}

/// Returns `true` if the current process is a swarm Worker (has agent + team env vars).
pub fn is_swarm_worker() -> bool {
    get_agent_id().is_some() && get_team_name().is_some()
}

// ─── TeamRegistry (in-memory) ─────────────────────────────────────────────────

/// Lightweight in-memory record of a running team.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TeamRecord {
    pub name: String,
    pub description: String,
    /// Agent IDs (or task IDs) of spawned workers.
    pub agents: Vec<String>,
}

/// In-process registry of active teams.  This is the authority for the
/// current-session view; persistent state lives in `swarm/team_lifecycle.rs`.
#[derive(Debug, Default)]
pub struct TeamRegistry {
    teams: HashMap<String, TeamRecord>,
}

impl TeamRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create_team(
        &mut self,
        name: impl Into<String>,
        description: impl Into<String>,
    ) -> &TeamRecord {
        let name = name.into();
        self.teams.entry(name.clone()).or_insert(TeamRecord {
            name,
            description: description.into(),
            agents: Vec::new(),
        })
    }

    pub fn delete_team(&mut self, name: &str) {
        self.teams.remove(name);
    }

    pub fn add_agent(&mut self, team_name: &str, agent_id: impl Into<String>) {
        if let Some(team) = self.teams.get_mut(team_name) {
            team.agents.push(agent_id.into());
        }
    }

    pub fn list_teams(&self) -> Vec<&TeamRecord> {
        self.teams.values().collect()
    }

    pub fn get_team(&self, name: &str) -> Option<&TeamRecord> {
        self.teams.get(name)
    }
}

// ─── Leader system-prompt context ─────────────────────────────────────────────

/// Build the coordinator-mode addition to the system prompt.
/// Injected when `is_coordinator_mode()` is `true`.
pub fn build_coordinator_system_prompt_addition(agents: &[AgentDefinition]) -> String {
    let mut s = String::from(
        "# Coordinator Mode\n\n\
         You are operating as a **Leader Agent** coordinating a team of Worker Agents.\n\n\
         ## Your Responsibilities\n\
         1. **Decompose** the user's request into concrete sub-tasks.\n\
         2. **Spawn** Worker Agents via the `spawn_subagent` tool and assign each sub-task.\n\
         3. **Aggregate** their results and communicate a unified summary back to the user.\n\n\
         ## Available Worker Types\n",
    );

    for agent in agents {
        s.push_str(&format!("- **{}**: {}\n", agent.name, agent.description));
    }

    s.push_str(
        "\n## Task Notification Format\n\
         Workers signal completion via XML inside their final message:\n\
         ```xml\n\
         <task-notification>\n\
           <task-id>{agent_id}</task-id>\n\
           <status>completed|failed|killed</status>\n\
           <summary>Human-readable summary</summary>\n\
           <result>Final text output</result>\n\
           <usage>\n\
             <total_tokens>N</total_tokens>\n\
             <tool_uses>N</tool_uses>\n\
             <duration_ms>N</duration_ms>\n\
           </usage>\n\
         </task-notification>\n\
         ```\n",
    );

    s
}

// ─── Task notification ─────────────────────────────────────────────────────────

/// Structured payload that a Worker sends to the Leader when it finishes.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TaskNotification {
    pub task_id: String,
    pub status: TaskNotificationStatus,
    pub summary: String,
    pub result: String,
    pub total_tokens: u64,
    pub tool_uses: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskNotificationStatus {
    Completed,
    Failed,
    Killed,
}

/// Serialise a `TaskNotification` into the XML envelope format understood by
/// the Leader's system prompt.
pub fn format_task_notification(n: &TaskNotification) -> String {
    let status = match n.status {
        TaskNotificationStatus::Completed => "completed",
        TaskNotificationStatus::Failed => "failed",
        TaskNotificationStatus::Killed => "killed",
    };
    format!(
        "<task-notification>\n  \
         <task-id>{}</task-id>\n  \
         <status>{}</status>\n  \
         <summary>{}</summary>\n  \
         <result>{}</result>\n  \
         <usage>\n    \
           <total_tokens>{}</total_tokens>\n    \
           <tool_uses>{}</tool_uses>\n    \
           <duration_ms>{}</duration_ms>\n  \
         </usage>\n\
         </task-notification>",
        n.task_id, status, n.summary, n.result, n.total_tokens, n.tool_uses, n.duration_ms,
    )
}
