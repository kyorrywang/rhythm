from typing import Optional
from pydantic import BaseModel, Field

class LLMConfig(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: str = "gpt-4o"

class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1)
    message: str = Field(min_length=1)
    workspace_path: Optional[str] = None
    llm_config: Optional[LLMConfig] = None
