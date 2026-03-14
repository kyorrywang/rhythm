from fastapi import APIRouter, Query

from gateway.core_client import CoreClient

router = APIRouter(prefix="/workflows", tags=["workflows"])
core_client = CoreClient()


@router.get("/templates")
def list_templates(workspace_path: str = Query(..., min_length=1)) -> dict:
    return {"templates": core_client.list_workflow_templates(workspace_path)}

@router.get("/instances")
def list_instances(
    workspace_path: str = Query(..., min_length=1),
    session_id: str | None = Query(None)
) -> dict:
    return {"instances": core_client.list_workflow_instances(workspace_path, session_id)}
