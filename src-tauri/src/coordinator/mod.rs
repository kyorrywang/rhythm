pub mod agent_definition;
pub mod coordinator_mode;

pub use agent_definition::{AgentDefinition, AgentDefinitionSource, builtin_agents, get_builtin_agent};
pub use coordinator_mode::{
    TeamRecord, TeamRegistry,
    is_coordinator_mode, is_swarm_worker, get_agent_id, get_team_name,
    TaskNotification, TaskNotificationStatus, format_task_notification,
    build_coordinator_system_prompt_addition,
};
