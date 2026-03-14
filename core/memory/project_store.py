from __future__ import annotations

import json
from pathlib import Path


class ProjectStore:
    def __init__(self, workspace_path: str) -> None:
        self.base_dir = Path(workspace_path) / ".rhythm"
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_project_state(self, state: dict) -> None:
        target = self.base_dir / "project_state.json"
        target.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
