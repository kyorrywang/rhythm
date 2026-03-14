from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class CoreSettings:
    runtime_data_dir: Path
    llm_api_key: str
    llm_model: str
    llm_base_url: str | None


def load_settings() -> CoreSettings:
    runtime_data = Path(os.getenv("RHYTHM_RUNTIME_DATA", "runtime_data"))
    runtime_data.mkdir(parents=True, exist_ok=True)
    return CoreSettings(
        runtime_data_dir=runtime_data,
        llm_api_key=os.getenv("OPENAI_API_KEY", ""),
        llm_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        llm_base_url=os.getenv("OPENAI_BASE_URL") or None,
    )
