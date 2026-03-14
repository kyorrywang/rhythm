from __future__ import annotations

from agents.base_agent import BaseAgent
from llm.client import LLMClient
from capabilities.capability import Capability


class PrimaryAgent(BaseAgent):
    """前台主 Agent：维持会话记忆、承接用户输入、统筹调度"""
    
    def __init__(self, llm_client: LLMClient):
        super().__init__(llm_client)
        self.capabilities: list[Capability] = []
        
    def add_capability(self, capability: Capability) -> None:
        """为 Agent 挂载特定的能力扩展"""
        self.capabilities.append(capability)
        self.register_tools(capability.get_tools())

    def get_capability_prompts(self, session_id: str) -> list[str]:
        """获取所有扩展能力想要动态注入的系统提示词"""
        prompts = []
        for cap in self.capabilities:
            prompts.extend(cap.get_system_prompts(session_id))
        return prompts
        
    def notify_capabilities_message(self, session_id: str, message: str) -> None:
        """当收到用户新消息时，通知所有扩展能力"""
        for cap in self.capabilities:
            cap.on_message_received(session_id, message)
