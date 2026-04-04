use tauri::ipc::Channel;
use crate::shared::schema::ServerEventChunk;
use crate::infrastructure::config;
use crate::core::models;
use crate::core::agent_loop::AgentLoop;

#[tauri::command]
pub async fn chat_stream(
    session_id: String,
    prompt: String,
    on_event: Channel<ServerEventChunk>,
) -> Result<(), String> {
    
    tokio::spawn(async move {
        // 1. Load settings
        let settings = config::load_settings();
           
        // 2. Create client based on provider
        let client = models::create_client(&settings.llm);

        // 3. Coordinate via AgentLoop
        let agent = AgentLoop::new(client);
        
        if let Err(e) = agent.run_stream(session_id, prompt, on_event.clone()).await {
            eprintln!("Generation error: {}", e);
            let _ = on_event.send(ServerEventChunk::TextDelta { content: format!("\n[Error: {}]", e) });
            let _ = on_event.send(ServerEventChunk::Done);
        }
    });

    Ok(())
}
