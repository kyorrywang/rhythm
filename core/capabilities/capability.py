from __future__ import annotations

from orchestrator.contracts import ToolDefinition


class Capability:
    """系统能力标准契约：规定配件如何向主引擎注册能力"""
    
    def get_tools(self) -> list[ToolDefinition]:
        """向主 Agent 注册工具"""
        return []

    def get_system_prompts(self, session_id: str) -> list[str]:
        """向主 Agent 动态注入当前 Session 的系统提示词"""
        return []

    def on_message_received(self, session_id: str, message: str) -> None:
        """拦截/监听用户的输入消息"""
        pass
