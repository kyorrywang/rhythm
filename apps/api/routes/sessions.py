from fastapi import APIRouter, Query

from gateway.core_client import CoreClient

router = APIRouter(prefix="/sessions", tags=["sessions"])
core_client = CoreClient()


@router.get("")
def list_sessions(workspace_path: str = Query(..., min_length=1)) -> dict:
    return {"sessions": core_client.list_sessions(workspace_path)}

@router.get("/{session_id}/history")
def get_history(session_id: str, workspace_path: str = Query(..., min_length=1)) -> dict:
    return {"history": core_client.get_session_history(workspace_path, session_id)}
