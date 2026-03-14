import sys
import json
import traceback
from typing import Any

# Make sure imports from core work
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from orchestrator.contracts import RuntimeRequest
from orchestrator.runtime import OrchestratorRuntime
from memory.session_store import SessionStore
from artifacts.artifact_service import ArtifactService
from project.workspace import WorkspaceManager
from capabilities.workflow.engine import WorkflowEngine
from infra.config_manager import ConfigManager

def emit(msg_type: str, data: Any):
    """Emit JSON to stdout and flush immediately so Rust can read it."""
    payload = json.dumps({"type": msg_type, "data": data}, ensure_ascii=False)
    sys.stdout.write(payload + "\n")
    sys.stdout.flush()

def handle_rpc(line: str, runtime: OrchestratorRuntime, config: ConfigManager, workspace_mgr: WorkspaceManager):
    try:
        req = json.loads(line)
        req_id = req.get("id")
        method = req.get("method")
        args = req.get("args", {})
        
        if not req_id or not method:
            return

        def respond(result):
            emit("rpc_response", {"id": req_id, "result": result, "error": None})

        def error(msg):
            emit("rpc_response", {"id": req_id, "result": None, "error": msg})

        # Routing
        try:
            if method == "init_workspace":
                workspace_mgr.init_workspace(args["workspace_path"])
                respond("ok")
                
            elif method == "list_sessions":
                res = SessionStore(args["workspace_path"]).list_sessions()
                respond(res)
                
            elif method == "get_session_history":
                history = SessionStore(args["workspace_path"]).load(args["session_id"])
                respond([h.to_dict() for h in history])
                
            elif method == "list_workflow_templates":
                engine = WorkflowEngine(args["workspace_path"])
                respond([t.to_dict() for t in engine.list_templates()])
                
            elif method == "list_workflow_instances":
                engine = WorkflowEngine(args["workspace_path"])
                res = engine.get_instances_for_session(args.get("session_id")) if args.get("session_id") else [
                    FlowInstance.from_dict(json.loads(p.read_text(encoding="utf-8"))) 
                    for p in engine.instance_dir.glob("*.json") if p.exists()
                ]
                respond([i.to_dict() for i in res] if res else [])
                
            elif method == "get_global_config":
                respond(config.get_global_config())
                
            elif method == "save_global_config":
                config.save_global_config(args["config"])
                respond("ok")
                
            elif method == "start_chat":
                # For chat, we return immediate ok, then stream chunks via special events
                respond("started")
                
                request = RuntimeRequest(
                    session_id=args["session_id"],
                    user_message=args["message"],
                    workspace_path=args["workspace_path"],
                )
                
                for chunk in runtime.handle_chat_stream(request):
                    # handle_chat_stream yields SSE formatted strings like "data: {...}\n\n"
                    # We parse them back out to send clean JSON over IPC
                    if chunk.startswith("data: "):
                        data_str = chunk[6:].strip()
                        if data_str == "[DONE]":
                            emit("chat_stream_done", {"session_id": args["session_id"]})
                        else:
                            try:
                                parsed = json.loads(data_str)
                                emit("chat_stream_chunk", {"session_id": args["session_id"], "payload": parsed})
                            except:
                                pass
                                
            else:
                error(f"Unknown method: {method}")
                
        except Exception as e:
            error(str(e))
            
    except Exception as e:
        # Failed to parse outer JSON, just ignore or log to stderr
        sys.stderr.write(f"IPC Error: {e}\n")

def main():
    runtime = OrchestratorRuntime()
    config = ConfigManager()
    workspace_mgr = WorkspaceManager()
    
    # Notify Rust that Python is ready
    emit("system", "ready")
    
    # Read from stdin line by line
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        if line == "exit":
            break
            
        handle_rpc(line, runtime, config, workspace_mgr)

if __name__ == "__main__":
    main()
