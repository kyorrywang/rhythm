from tools.skills.skill_registry import SkillRegistry


class SkillAdapter:
    def __init__(self, registry: SkillRegistry | None = None) -> None:
        self.registry = registry or SkillRegistry()

    def as_tool(self, skill_name: str):
        def _call(arguments: dict):
            prompt = self.registry.get(skill_name) or ""
            return f"Skill 模拟执行: {skill_name}, prompt={prompt}, args={arguments}"

        return _call
