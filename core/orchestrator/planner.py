from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class RuntimePlan:
    requires_tool_use: bool


class Planner:
    def build_plan(self, user_message: str) -> RuntimePlan:
        return RuntimePlan(requires_tool_use=True)
