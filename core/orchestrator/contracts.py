from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Callable


@dataclass(slots=True)
class ChatMessage:
    role: str
    content: str | None = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None
    name: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(slots=True)
class ToolResult:
    id: str
    name: str
    ok: bool
    output: Any


@dataclass(slots=True)
class ToolDefinition:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[[dict[str, Any]], Any]


@dataclass(slots=True)
class RuntimeRequest:
    session_id: str
    user_message: str
    workspace_path: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    model: str = "gpt-4o"


@dataclass(slots=True)
class RuntimeResponse:
    session_id: str
    reply: str
    used_tools: list[ToolResult]
    artifact_ids: list[str]
