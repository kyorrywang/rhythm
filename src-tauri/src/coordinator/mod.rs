pub mod agent_definition;
pub mod coordinator_mode;

pub use agent_definition::{
    builtin_agents, get_builtin_agent, AgentDefinition, AgentDefinitionSource,
};
pub use coordinator_mode::{
    build_coordinator_system_prompt_fragment, format_task_notification, get_agent_id,
    get_team_name, is_coordinator_mode, is_swarm_worker, TaskNotification, TaskNotificationStatus,
    TeamRecord, TeamRegistry,
};
