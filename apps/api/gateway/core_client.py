from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[3]
CORE_DIR = ROOT_DIR / "core"
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))

from orchestrator.contracts import RuntimeRequest
from orchestrator.runtime import OrchestratorRuntime
from memory.session_store import SessionStore
from artifacts.artifact_service import ArtifactService
from infra.config_manager import ConfigManager
from project.workspace import WorkspaceManager
from capabilities.workflow.engine import WorkflowEngine


class CoreClient:
    def __init__(self) -> None:
        self.runtime = OrchestratorRuntime()
        self.config_manager = ConfigManager()
        self.workspace_manager = WorkspaceManager()

    def chat(self, session_id: str, message: str, workspace_path: str, api_key: str | None = None, base_url: str | None = None, model: str = "gpt-4o"):
        return self.runtime.handle_chat_stream(
            RuntimeRequest(
                session_id=session_id, 
                user_message=message,
                workspace_path=workspace_path,
                api_key=api_key,
                base_url=base_url,
                model=model
            )
        )

    def init_workspace(self, workspace_path: str) -> None:
        self.workspace_manager.init_workspace(workspace_path)

    def list_sessions(self, workspace_path: str) -> list[str]:
        return SessionStore(workspace_path).list_sessions()

    def get_session_history(self, workspace_path: str, session_id: str) -> list[dict]:
        return [msg.to_dict() for msg in SessionStore(workspace_path).load(session_id)]

    def list_artifacts(self, workspace_path: str, session_id: str) -> list[dict]:
        return ArtifactService(workspace_path).list_by_session(session_id)
        
    def list_workflow_templates(self, workspace_path: str) -> list[dict]:
        engine = WorkflowEngine(workspace_path)
        return [t.to_dict() for t in engine.list_templates()]
        
    def list_workflow_instances(self, workspace_path: str, session_id: str | None = None) -> list[dict]:
        engine = WorkflowEngine(workspace_path)
        if session_id:
            res = engine.get_instances_for_session(session_id)
        else:
            # list all (fallback)
            res = []
            for p in engine.instance_dir.glob("*.json"):
                try:
                    import json
                    from capabilities.workflow.models import FlowInstance
                    res.append(FlowInstance.from_dict(json.loads(p.read_text(encoding="utf-8"))))
                except Exception:
                    pass
        return [i.to_dict() for i in res]
