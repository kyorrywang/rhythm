from __future__ import annotations

import json
from pathlib import Path

from orchestrator.contracts import ChatMessage


class SessionStore:
    def __init__(self, workspace_path: str) -> None:
        self.base_dir = Path(workspace_path) / ".rhythm" / "sessions"
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, session_id: str) -> Path:
        return self.base_dir / f"{session_id}.json"

    def load(self, session_id: str) -> list[ChatMessage]:
        target = self._path(session_id)
        if not target.exists():
            return []
        raw = json.loads(target.read_text(encoding="utf-8"))
        return [ChatMessage(**item) for item in raw]

    def append(self, session_id: str, message: ChatMessage) -> None:
        history = self.load(session_id)
        history.append(message)
        target = self._path(session_id)
        payload = [item.to_dict() for item in history]
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_sessions(self) -> list[str]:
        return sorted(path.stem for path in self.base_dir.glob("*.json"))
