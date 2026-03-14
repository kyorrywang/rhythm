from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from dto.request import ChatRequest
from gateway.core_client import CoreClient

router = APIRouter(prefix="/chat", tags=["chat"])
core_client = CoreClient()


@router.post("")
def chat(req: ChatRequest):
    llm_key = req.llm_config.api_key if req.llm_config else None
    llm_url = req.llm_config.base_url if req.llm_config else None
    llm_model = req.llm_config.model if req.llm_config else "gpt-4o"
    
    stream = core_client.chat(
        session_id=req.session_id, 
        message=req.message,
        workspace_path=req.workspace_path,
        api_key=llm_key,
        base_url=llm_url,
        model=llm_model
    )
    
    return StreamingResponse(stream, media_type="text/event-stream")
