from __future__ import annotations

import json
from pathlib import Path


class WorkspaceManager:
    def __init__(self) -> None:
        pass

    def init_workspace(self, workspace_path: str) -> None:
        """Initializes a target directory as a Rhythm workspace."""
        base = Path(workspace_path)
        base.mkdir(parents=True, exist_ok=True)

        rhythm_dir = base / ".rhythm"
        rhythm_dir.mkdir(parents=True, exist_ok=True)
        
        # Create default config if not exists
        settings_path = rhythm_dir / "settings.json"
        if not settings_path.exists():
            settings_path.write_text(json.dumps({}, indent=2), encoding="utf-8")

        # Create subdirectories for local data
        (rhythm_dir / "sessions").mkdir(exist_ok=True)
        (rhythm_dir / "flow_instances").mkdir(exist_ok=True)
        (rhythm_dir / "artifacts").mkdir(exist_ok=True)

        # Workflows dir exposed to the user
        (base / "workflows").mkdir(exist_ok=True)

        # Global prompt instructions for this project
        rhythm_md = base / ".RHYTHM.md"
        if not rhythm_md.exists():
            rhythm_md.write_text("# Rhythm Project Context\n\nAdd global instructions or context for this project here.\n", encoding="utf-8")
