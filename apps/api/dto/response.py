from pydantic import BaseModel


class ToolUseItem(BaseModel):
    name: str
    ok: bool
    output: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    used_tools: list[ToolUseItem]
    artifact_ids: list[str]
