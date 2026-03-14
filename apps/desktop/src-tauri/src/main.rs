// apps/desktop/src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use futures_util::StreamExt;
use serde::Deserialize;
use tauri::{Emitter, Runtime};

#[derive(Deserialize)]
struct ChatPayload {
    session_id: String,
    message: String,
    workspace_path: String,
}

#[tauri::command]
async fn stream_chat<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: ChatPayload,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let res: reqwest::Response = client
        .post("http://127.0.0.1:8000/chat")
        .json(&serde_json::json!({
            "session_id": payload.session_id,
            "message": payload.message,
            "workspace_path": payload.workspace_path,
        }))
        .send()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;

    let mut stream = res.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e: reqwest::Error| e.to_string())?;
        let text = String::from_utf8_lossy(&chunk);

        // SSE parsing: data: {...}\n\n
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with("data: ") {
                let data = &line[6..];
                if data == "[DONE]" {
                    app.emit("chat-finished", ()).map_err(|e| e.to_string())?;
                } else {
                    app.emit("chat-event", data).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![stream_chat])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
