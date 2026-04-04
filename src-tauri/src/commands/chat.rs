use tauri::ipc::Channel;
use crate::shared::schema::{ServerEventChunk, EventPayload};
use crate::core::agent_loop::AgentLoop;
use crate::core::models;
use crate::core::state;
use crate::core::agent_registry;
use crate::core::event_bus;
use crate::infrastructure::config;

#[tauri::command]
pub async fn chat_stream(
    session_id: String,
    prompt: String,
    on_event: Channel<ServerEventChunk>,
) -> Result<(), String> {
    let agent_id = agent_registry::register_agent(
        session_id.clone(),
        None,
        0,
    );

    event_bus::register_ipc_channel(&agent_id, on_event.clone());

    tokio::spawn(async move {
        let settings = config::load_settings();
        let client = models::create_client(&settings.llm);
        let agent = AgentLoop::new(client);

        if let Err(e) = agent.run_stream(&agent_id, session_id.clone(), prompt, None).await {
            eprintln!("Generation error: {}", e);
            event_bus::emit(&agent_id, &session_id, EventPayload::TextDelta {
                content: format!("\n[Error: {}]", e),
            });
            event_bus::emit(&agent_id, &session_id, EventPayload::Done);
        }

        event_bus::unregister(&agent_id);
        agent_registry::unregister_agent(&agent_id);
        state::unregister_session_tree(&session_id).await;
    });

    Ok(())
}

#[tauri::command]
pub async fn submit_user_answer(
    session_id: String,
    answer: String,
) -> Result<(), String> {
    state::resume_ask(&session_id, answer).await
}
