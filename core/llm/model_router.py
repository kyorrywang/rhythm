from __future__ import annotations

from infra.config_manager import ConfigManager
from llm.client import LLMClient


class ModelRouter:
    def __init__(self) -> None:
        self.config_manager = ConfigManager()

    def get_client(self, workspace_path: str | None = None, api_key: str | None = None, base_url: str | None = None, model: str | None = None) -> LLMClient:
        config = self.config_manager.get_effective_config(workspace_path)
        
        # Priority: 1. Runtime args -> 2. Config files
        final_api_key = api_key or config.get("llm_api_key") or "dummy-key-for-now"
        final_model = model or config.get("llm_model") or "gpt-4o"
        final_base_url = base_url or config.get("llm_base_url")

        return LLMClient(
            api_key=final_api_key,
            model=final_model,
            base_url=final_base_url,
        )
