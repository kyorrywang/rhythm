from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(slots=True)
class ApiSettings:
    host: str
    port: int
    cors_origins: list[str]


def load_settings() -> ApiSettings:
    host = os.getenv("RHYTHM_API_HOST", "127.0.0.1")
    port = int(os.getenv("RHYTHM_API_PORT", "8000"))
    origins = os.getenv(
        "RHYTHM_CORS_ORIGINS",
        "http://localhost:1420,http://localhost:5173",
    ).split(",")
    return ApiSettings(host=host, port=port, cors_origins=[item.strip() for item in origins])
