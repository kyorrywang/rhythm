pub fn get_agent_id() -> Option<String> {
    std::env::var("RHYTHM_AGENT_ID")
        .ok()
        .filter(|value| !value.is_empty())
}

pub fn get_team_name() -> Option<String> {
    std::env::var("RHYTHM_TEAM_NAME")
        .ok()
        .filter(|value| !value.is_empty())
}

pub fn is_swarm_worker() -> bool {
    get_agent_id().is_some() && get_team_name().is_some()
}
