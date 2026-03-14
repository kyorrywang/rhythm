from __future__ import annotations

from orchestrator.contracts import ToolResult


def normalize_tool_result(result: ToolResult) -> str:
    prefix = "成功" if result.ok else "失败"
    return f"[{prefix}] {result.name}: {result.output}"
