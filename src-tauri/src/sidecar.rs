use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

// The global struct we inject into Tauri's state
pub struct SidecarState {
    request_tx: mpsc::Sender<RpcRequest>,
}

pub struct RpcRequest {
    pub method: String,
    pub args: Value,
    pub tx: oneshot::Sender<Result<Value, String>>,
}

#[derive(Serialize)]
struct IpcMessage {
    id: u64,
    method: String,
    args: Value,
}

#[derive(Deserialize, Debug)]
struct IpcResponse {
    #[serde(rename = "type")]
    msg_type: String,
    data: Value,
}

pub async fn spawn_sidecar(app_handle: AppHandle) -> SidecarState {
    let (req_tx, mut req_rx) = mpsc::channel::<RpcRequest>(100);
    let pending_requests: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>> = Arc::new(Mutex::new(HashMap::new()));
    let pending_clone = pending_requests.clone();

    // Spawn the python process. 
    // In dev mode, we use `python core/ipc_server.py`.
    // In prod, this would use tauri_plugin_shell::Sidecar.
    let mut child = Command::new("python")
        .arg("core/ipc_server.py")
        .current_dir(std::env::current_dir().unwrap())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .expect("Failed to start python sidecar");

    let mut stdin = child.stdin.take().expect("Failed to open stdin");
    let stdout = child.stdout.take().expect("Failed to open stdout");

    // Task 1: Write requests to Python stdin
    tokio::spawn(async move {
        let mut request_id: u64 = 0;
        while let Some(req) = req_rx.recv().await {
            request_id += 1;
            
            let msg = IpcMessage {
                id: request_id,
                method: req.method,
                args: req.args,
            };
            
            let json_str = serde_json::to_string(&msg).unwrap() + "\n";
            pending_requests.lock().await.insert(request_id, req.tx);
            
            if let Err(e) = stdin.write_all(json_str.as_bytes()).await {
                eprintln!("Failed to write to sidecar: {}", e);
            }
        }
    });

    // Task 2: Read responses from Python stdout
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(res) = serde_json::from_str::<IpcResponse>(&line) {
                match res.msg_type.as_str() {
                    "system" => {
                        println!("Sidecar system message: {:?}", res.data);
                    }
                    "rpc_response" => {
                        if let Some(id) = res.data.get("id").and_then(|v| v.as_u64()) {
                            if let Some(tx) = pending_clone.lock().await.remove(&id) {
                                if let Some(err) = res.data.get("error").filter(|v| !v.is_null()) {
                                    let _ = tx.send(Err(err.as_str().unwrap_or("Unknown error").to_string()));
                                } else {
                                    let _ = tx.send(Ok(res.data.get("result").unwrap_or(&Value::Null).clone()));
                                }
                            }
                        }
                    }
                    "chat_stream_chunk" => {
                        // Forward directly to frontend
                        let payload = res.data.get("payload").unwrap();
                        let msg_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        
                        if msg_type == "chunk" {
                            let content = payload.get("content").and_then(|v| v.as_str()).unwrap_or("");
                            let _ = app_handle_clone.emit("chat-chunk", content);
                        } else if msg_type == "metadata" {
                            let _ = app_handle_clone.emit("chat-metadata", payload);
                        }
                    }
                    "chat_stream_done" => {
                        let _ = app_handle_clone.emit("chat-done", ());
                    }
                    _ => {
                        println!("Unknown IPC message type: {}", res.msg_type);
                    }
                }
            } else {
                println!("Sidecar generic output: {}", line);
            }
        }
        println!("Sidecar process terminated.");
    });

    SidecarState { request_tx: req_tx }
}

impl SidecarState {
    pub async fn call(&self, method: &str, args: Value) -> Result<Value, String> {
        let (tx, rx) = oneshot::channel();
        self.request_tx.send(RpcRequest {
            method: method.to_string(),
            args,
            tx,
        }).await.map_err(|e| e.to_string())?;

        rx.await.map_err(|e| e.to_string())?
    }
}
