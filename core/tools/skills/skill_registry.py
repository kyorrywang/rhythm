from __future__ import annotations


class SkillRegistry:
    def __init__(self) -> None:
        self._skills: dict[str, str] = {}

    def register(self, name: str, prompt: str) -> None:
        self._skills[name] = prompt

    def get(self, name: str) -> str | None:
        return self._skills.get(name)
