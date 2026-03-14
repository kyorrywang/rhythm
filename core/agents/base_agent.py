from __future__ import annotations

import json
from llm.client import LLMClient
from orchestrator.contracts import ChatMessage, ToolDefinition, ToolResult
from tool_use.executor import ToolExecutor
from tool_use.tool_registry import ToolRegistry


class BaseAgent:
    def __init__(self, llm_client: LLMClient):
        self.llm = llm_client
        self.registry = ToolRegistry()
        self.executor = ToolExecutor(self.registry)

    def register_tool(self, definition: ToolDefinition) -> None:
        self.registry.register(definition)

    def register_tools(self, definitions: list[ToolDefinition]) -> None:
        for tool in definitions:
            self.register_tool(tool)

    def run_step(self, history: list[ChatMessage]) -> tuple[ChatMessage, list[ToolResult]]:
        """执行一个单步 ReAct 循环：思考 -> 决定调用工具 (或直接回复)"""
        tools_schema = self.registry.get_all_schemas()
        decision = self.llm.decide(history, tools=tools_schema)
        
        if not decision.tool_calls:
            return ChatMessage(role="assistant", content=decision.text), []
            
        assistant_msg = ChatMessage(role="assistant", content=decision.text)
        assistant_msg.tool_calls = [
            {
                "id": t.id,
                "type": "function",
                "function": {"name": t.name, "arguments": json.dumps(t.arguments)}
            }
            for t in decision.tool_calls
        ]
        
        tool_results = [self.executor.run(call) for call in decision.tool_calls]
        return assistant_msg, tool_results
