from __future__ import annotations

from orchestrator.contracts import ToolCall, ToolResult
from tool_use.tool_registry import ToolRegistry


class ToolExecutor:
    def __init__(self, registry: ToolRegistry) -> None:
        self._registry = registry

    def run(self, call: ToolCall) -> ToolResult:
        definition = self._registry.get(call.name)
        if definition is None:
            return ToolResult(id=call.id, name=call.name, ok=False, output=f"未找到工具: {call.name}")
        try:
            output = definition.handler(call.arguments)
            return ToolResult(id=call.id, name=call.name, ok=True, output=output)
        except Exception as exc:
            return ToolResult(id=call.id, name=call.name, ok=False, output=f"工具执行失败: {exc}")
