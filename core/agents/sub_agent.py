from __future__ import annotations

import threading
from typing import Callable

from agents.base_agent import BaseAgent
from llm.client import LLMClient
from orchestrator.contracts import ChatMessage


class SubAgent(BaseAgent):
    """后台子 Agent：无状态、独立上下文、聚焦单一任务（支持多开/并发）"""
    
    def __init__(self, llm_client: LLMClient, objective: str):
        super().__init__(llm_client)
        self.objective = objective
        self.history = [
            ChatMessage(
                role="system", 
                content=f"你是独立运行的后台 SubAgent。\n"
                        f"这是你的专属执行空间，你不会看到用户日常的闲聊。\n"
                        f"你的核心目标是：\n{objective}"
            )
        ]
        self._on_finish: Callable[[], None] | None = None
        self._is_paused = False

    def set_on_finish(self, callback: Callable[[], None]) -> None:
        self._on_finish = callback

    def pause(self) -> None:
        self._is_paused = True
        
    def resume(self) -> None:
        self._is_paused = False
        self.run_async()

    def run(self) -> None:
        """同步运行，直到任务完成或被挂起"""
        if len(self.history) == 1:
            self.history.append(ChatMessage(role="user", content="请开始执行任务。"))
            
        while not self._is_paused:
            assistant_msg, tool_results = self.run_step(self.history)
            self.history.append(assistant_msg)
            
            if not tool_results:
                # 没有工具调用，说明大模型认为任务结束了
                if self._on_finish:
                    self._on_finish()
                break
                
            for res in tool_results:
                tool_msg = ChatMessage(
                    role="tool",
                    content=str(res.output),
                    tool_call_id=res.id,
                    name=res.name
                )
                self.history.append(tool_msg)
                
            # 在这里，如果有工具（如 ask_user）修改了 agent 状态使其暂停，
            # 那么 self._is_paused 会变为 True，下一次循环将退出。

    def run_async(self) -> None:
        """启动后台线程运行"""
        thread = threading.Thread(target=self.run)
        thread.daemon = True
        thread.start()
