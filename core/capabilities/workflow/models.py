from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass(slots=True)
class FlowStep:
    name: str
    instruction: str
    completion_condition: str | None = None
    
    @classmethod
    def from_dict(cls, data: dict) -> FlowStep:
        return cls(
            name=data.get("name", ""),
            instruction=data.get("instruction", ""),
            completion_condition=data.get("completion_condition")
        )

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class FlowTemplate:
    id: str
    name: str
    description: str
    steps: list[FlowStep]
    
    def to_dict(self) -> dict:
        data = asdict(self)
        data["steps"] = [s.to_dict() for s in self.steps]
        return data

    @classmethod
    def from_dict(cls, data: dict) -> FlowTemplate:
        steps = [FlowStep.from_dict(s) for s in data.get("steps", [])]
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            description=data.get("description", ""),
            steps=steps
        )


@dataclass(slots=True)
class FlowInstance:
    id: str  # Unique instance ID, independent of session
    session_id: str
    template_id: str
    workspace_path: str
    current_step_index: int = 0
    state: str = "PENDING"  # PENDING, RUNNING, WAITING_FOR_USER, PAUSED, COMPLETED, FAILED
    context_data: dict[str, Any] = field(default_factory=dict)
    pending_question: str | None = None
    required_keys: list[str] = field(default_factory=list)
    
    def to_dict(self) -> dict:
        return asdict(self)
        
    @classmethod
    def from_dict(cls, data: dict) -> FlowInstance:
        return cls(
            id=data.get("id", ""),
            session_id=data.get("session_id", ""),
            template_id=data.get("template_id", ""),
            workspace_path=data.get("workspace_path", ""),
            current_step_index=data.get("current_step_index", 0),
            state=data.get("state", "PENDING"),
            context_data=data.get("context_data", {}),
            pending_question=data.get("pending_question"),
            required_keys=data.get("required_keys", [])
        )
