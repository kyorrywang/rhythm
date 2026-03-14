from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from uuid import uuid4


class ArtifactService:
    def __init__(self, workspace_path: str) -> None:
        self.base_dir = Path(workspace_path) / ".rhythm" / "artifacts"
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def create(self, session_id: str, content: str, kind: str = "tool_result") -> str:
        artifact_id = str(uuid4())
        payload = {
            "id": artifact_id,
            "session_id": session_id,
            "kind": kind,
            "content": content,
            "created_at": datetime.utcnow().isoformat(),
        }
        target = self.base_dir / f"{artifact_id}.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return artifact_id

    def list_by_session(self, session_id: str) -> list[dict]:
        result: list[dict] = []
        for item in self.base_dir.glob("*.json"):
            try:
                data = json.loads(item.read_text(encoding="utf-8"))
                if data.get("session_id") == session_id:
                    result.append(data)
            except Exception:
                pass
        result.sort(key=lambda x: x.get("created_at", ""))
        return result
