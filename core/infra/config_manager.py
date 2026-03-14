from __future__ import annotations

import json
from pathlib import Path


class ConfigManager:
    """Manages hierarchical configuration: Global -> Workspace -> Session/Flow"""
    
    def __init__(self) -> None:
        self.global_dir = Path.home() / ".rhythm"
        self.global_config_path = self.global_dir / "settings.json"
        
    def _load_json(self, path: Path) -> dict:
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                return {}
        return {}

    def get_global_config(self) -> dict:
        return self._load_json(self.global_config_path)

    def get_workspace_config(self, workspace_path: str) -> dict:
        path = Path(workspace_path) / ".rhythm" / "settings.json"
        return self._load_json(path)

    def save_global_config(self, config: dict) -> None:
        self.global_dir.mkdir(parents=True, exist_ok=True)
        self.global_config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

    def save_workspace_config(self, workspace_path: str, config: dict) -> None:
        path = Path(workspace_path) / ".rhythm" / "settings.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_effective_config(self, workspace_path: str | None = None) -> dict:
        """Merge global and workspace configs. Workspace overrides global."""
        config = self.get_global_config()
        if workspace_path:
            config.update(self.get_workspace_config(workspace_path))
        return config
