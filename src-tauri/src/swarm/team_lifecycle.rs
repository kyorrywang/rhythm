use std::collections::HashMap;
use std::path::PathBuf;

use super::types::{AgentSummary, BackendType};
use crate::infrastructure::paths;

// ─── Team member ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TeamMember {
    pub agent_id: String,
    pub name: String,
    pub backend_type: BackendType,
    pub joined_at: f64,
    pub status: String, // "active" | "idle" | "stopped"
    pub model: Option<String>,
    pub color: Option<String>,
    pub session_id: Option<String>,
    pub worktree_path: Option<String>,
    #[serde(default = "default_true")]
    pub is_active: bool,
}

fn default_true() -> bool {
    true
}

// ─── TeamFile (persisted) ─────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TeamFile {
    pub name: String,
    pub created_at: f64,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub lead_agent_id: String,
    #[serde(default)]
    pub members: HashMap<String, TeamMember>,
}

// ─── TeamLifecycleManager ─────────────────────────────────────────────────────

/// Manages team metadata persistence under `~/.rhythm/data/teams/<name>/`.
pub struct TeamLifecycleManager {
    base_dir: PathBuf,
}

impl TeamLifecycleManager {
    pub fn new() -> Self {
        Self {
            base_dir: paths::get_teams_dir(),
        }
    }

    fn team_dir(&self, name: &str) -> PathBuf {
        self.base_dir.join(name)
    }

    fn team_json_path(&self, name: &str) -> PathBuf {
        self.team_dir(name).join("team.json")
    }

    /// Create a new team directory and persist initial `team.json`.
    pub fn create_team(
        &self,
        name: &str,
        description: &str,
    ) -> Result<TeamFile, crate::shared::error::RhythmError> {
        let dir = self.team_dir(name);
        std::fs::create_dir_all(&dir).map_err(crate::shared::error::RhythmError::IoError)?;
        // Create subdirectories
        std::fs::create_dir_all(dir.join("permissions").join("pending"))
            .map_err(crate::shared::error::RhythmError::IoError)?;
        std::fs::create_dir_all(dir.join("permissions").join("resolved"))
            .map_err(crate::shared::error::RhythmError::IoError)?;
        std::fs::create_dir_all(dir.join("agents"))
            .map_err(crate::shared::error::RhythmError::IoError)?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs_f64();

        let team = TeamFile {
            name: name.to_string(),
            created_at: now,
            description: description.to_string(),
            lead_agent_id: String::new(),
            members: HashMap::new(),
        };
        self.save_team(&team)?;
        Ok(team)
    }

    pub fn delete_team(&self, name: &str) -> Result<(), crate::shared::error::RhythmError> {
        let dir = self.team_dir(name);
        if dir.exists() {
            std::fs::remove_dir_all(&dir).map_err(crate::shared::error::RhythmError::IoError)?;
        }
        Ok(())
    }

    pub fn get_team(&self, name: &str) -> Option<TeamFile> {
        let path = self.team_json_path(name);
        let text = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&text).ok()
    }

    pub fn list_teams(&self) -> Vec<TeamFile> {
        let Ok(dir) = std::fs::read_dir(&self.base_dir) else {
            return vec![];
        };
        dir.flatten()
            .filter_map(|e| {
                let p = e.path().join("team.json");
                let text = std::fs::read_to_string(p).ok()?;
                serde_json::from_str(&text).ok()
            })
            .collect()
    }

    pub fn add_member(
        &self,
        team_name: &str,
        member: TeamMember,
    ) -> Result<TeamFile, crate::shared::error::RhythmError> {
        let mut team = self.get_team(team_name).ok_or_else(|| {
            crate::shared::error::RhythmError::ConfigError(format!(
                "Team '{}' not found",
                team_name
            ))
        })?;

        // Create agent inbox directory
        let inbox_dir = self
            .team_dir(team_name)
            .join("agents")
            .join(&member.agent_id)
            .join("inbox");
        std::fs::create_dir_all(&inbox_dir).map_err(crate::shared::error::RhythmError::IoError)?;

        team.members.insert(member.agent_id.clone(), member);
        self.save_team(&team)?;
        Ok(team)
    }

    pub fn remove_member(
        &self,
        team_name: &str,
        agent_id: &str,
    ) -> Result<TeamFile, crate::shared::error::RhythmError> {
        let mut team = self.get_team(team_name).ok_or_else(|| {
            crate::shared::error::RhythmError::ConfigError(format!(
                "Team '{}' not found",
                team_name
            ))
        })?;
        team.members.remove(agent_id);
        self.save_team(&team)?;
        Ok(team)
    }

    fn save_team(&self, team: &TeamFile) -> Result<(), crate::shared::error::RhythmError> {
        let path = self.team_json_path(&team.name);
        let json = serde_json::to_string_pretty(team)
            .map_err(|e| crate::shared::error::RhythmError::SerdeError(e.to_string()))?;
        std::fs::write(&path, json).map_err(crate::shared::error::RhythmError::IoError)?;
        Ok(())
    }

    /// Produce frontend-friendly summaries from active team members.
    pub fn list_agents_in_team(&self, team_name: &str) -> Vec<AgentSummary> {
        self.get_team(team_name)
            .map(|t| {
                t.members
                    .values()
                    .map(|m| AgentSummary {
                        agent_id: m.agent_id.clone(),
                        name: m.name.clone(),
                        backend_type: m.backend_type.clone(),
                        status: m.status.clone(),
                        joined_at: m.joined_at,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
}

impl Default for TeamLifecycleManager {
    fn default() -> Self {
        Self::new()
    }
}
