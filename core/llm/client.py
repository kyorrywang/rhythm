from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

from openai import OpenAI
from orchestrator.contracts import ChatMessage, ToolCall


@dataclass(slots=True)
class LLMDecision:
    text: str | None
    tool_calls: list[ToolCall]


class LLMClient:
    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self._client = OpenAI(api_key=api_key, base_url=base_url) if api_key else None

    def _build_messages(self, history: list[ChatMessage]) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": (
                    "你是桌面编排器助手。你可以正常聊天，也可以调用工具。\n"
                ),
            }
        ]
        for item in history:
            msg: dict[str, Any] = {"role": item.role}
            if item.content is not None:
                msg["content"] = item.content
            if item.tool_calls:
                msg["tool_calls"] = item.tool_calls
            if item.tool_call_id:
                msg["tool_call_id"] = item.tool_call_id
            if item.name:
                msg["name"] = item.name
            messages.append(msg)
        return messages

    def decide(self, history: list[ChatMessage], tools: list[dict[str, Any]] | None = None) -> LLMDecision:
        if self._client is None:
            return LLMDecision(text="已收到，这里是Mock环境。", tool_calls=[])
            
        try:
            kwargs = {
                "model": self.model,
                "messages": self._build_messages(history),
                "temperature": 0.7,
            }
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"
                
            response = self._client.chat.completions.create(**kwargs)
            message = response.choices[0].message
            tool_calls: list[ToolCall] = []
            for call in message.tool_calls or []:
                arguments = call.function.arguments or "{}"
                if isinstance(arguments, str):
                    try:
                        parsed = json.loads(arguments)
                    except json.JSONDecodeError:
                        parsed = {}
                else:
                    parsed = arguments
                if not isinstance(parsed, dict):
                    parsed = {}
                tool_calls.append(ToolCall(id=call.id, name=call.function.name, arguments=parsed))
            return LLMDecision(text=message.content, tool_calls=tool_calls)
        except Exception as e:
            raise Exception(f"LLM API Error: {str(e)}")

    def finalize_stream(self, history: list[ChatMessage]):
        if self._client is None:
            yield f"好的，执行完成。"
            return

        try:
            kwargs = {
                "model": self.model,
                "messages": self._build_messages(history),
                "temperature": 0.7,
                "stream": True,
            }
            response = self._client.chat.completions.create(**kwargs)
            for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            yield f"\n[LLM Error: {str(e)}]"
