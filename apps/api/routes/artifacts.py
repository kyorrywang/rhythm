from fastapi import APIRouter, Query

from gateway.core_client import CoreClient

router = APIRouter(prefix="/artifacts", tags=["artifacts"])
core_client = CoreClient()


@router.get("")
def list_artifacts(
    session_id: str = Query(..., min_length=1),
    workspace_path: str = Query(..., min_length=1)
) -> dict:
    return {"artifacts": core_client.list_artifacts(workspace_path, session_id)}
