use tauri::ipc::Channel;
use tokio::time::{sleep, Duration};
use crate::shared::schema::ServerEventChunk;

#[tauri::command]
pub async fn chat_stream(
    session_id: String,
    prompt: String,
    on_event: Channel<ServerEventChunk>,
) -> Result<(), String> {
    
    // Spawning a task so the command returns immediately and doesn't block the UI
    tokio::spawn(async move {
        let _ = session_id; // unused for mock
        let _ = prompt;     // unused for mock

        // Here we simulate the process
        sleep(Duration::from_millis(800)).await;
        let _ = on_event.send(ServerEventChunk::ThinkingEnd { time_cost_ms: 800 });

        let msg = "我正在准备执行命令。\n\n";
        for c in msg.chars() {
            sleep(Duration::from_millis(100)).await;
            let _ = on_event.send(ServerEventChunk::TextDelta { content: c.to_string() });
        }

        // Shell tool
        sleep(Duration::from_millis(500)).await;
        let _ = on_event.send(ServerEventChunk::ToolStart {
            tool_id: "tool-s1".to_string(),
            tool_name: "shell".to_string(),
            args: serde_json::json!({ "command": "ls -la" })
        });
        
        sleep(Duration::from_millis(200)).await;
        let _ = on_event.send(ServerEventChunk::ToolOutput {
            tool_id: "tool-s1".to_string(),
            log_line: "$ ls -la".to_string()
        });
        
        sleep(Duration::from_millis(200)).await;
        let _ = on_event.send(ServerEventChunk::ToolOutput {
            tool_id: "tool-s1".to_string(),
            log_line: "total 128".to_string()
        });
        
        sleep(Duration::from_millis(200)).await;
        let _ = on_event.send(ServerEventChunk::ToolOutput {
            tool_id: "tool-s1".to_string(),
            log_line: "-rw-r--r-- 1 user user package.json".to_string()
        });
        
        sleep(Duration::from_millis(200)).await;
        let _ = on_event.send(ServerEventChunk::ToolOutput {
            tool_id: "tool-s1".to_string(),
            log_line: "[Process exited with code 0]".to_string()
        });

        sleep(Duration::from_millis(100)).await;
        let _ = on_event.send(ServerEventChunk::ToolEnd {
            tool_id: "tool-s1".to_string(),
            exit_code: 0
        });

        sleep(Duration::from_millis(400)).await;
        let msg2 = "查看了目录，现在为您生成文件：\n\n";
        for c in msg2.chars() {
            sleep(Duration::from_millis(50)).await;
            let _ = on_event.send(ServerEventChunk::TextDelta { content: c.to_string() });
        }

        // Write tool
        sleep(Duration::from_millis(300)).await;
        let _ = on_event.send(ServerEventChunk::ToolStart {
            tool_id: "tool-w1".to_string(),
            tool_name: "write".to_string(),
            args: serde_json::json!({ "path": "PROJECT_PLAN.md" })
        });

        let plan_content = "# PROJECT_PLAN\n\n## Introduction\nTesting writing module...";
        sleep(Duration::from_millis(500)).await;
        let _ = on_event.send(ServerEventChunk::ToolOutput {
            tool_id: "tool-w1".to_string(),
            log_line: plan_content.to_string()
        });
        
        sleep(Duration::from_millis(100)).await;
        let _ = on_event.send(ServerEventChunk::ToolEnd {
            tool_id: "tool-w1".to_string(),
            exit_code: 0
        });

        sleep(Duration::from_millis(800)).await;
        let msg3 = "已经完成了所有的代码演示更新，需要进入正式开发吗？";
        for c in msg3.chars() {
            sleep(Duration::from_millis(50)).await;
            let _ = on_event.send(ServerEventChunk::TextDelta { content: c.to_string() });
        }

        sleep(Duration::from_millis(100)).await;
        let _ = on_event.send(ServerEventChunk::Done);
    });

    Ok(())
}
