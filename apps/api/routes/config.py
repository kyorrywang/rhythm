from fastapi import APIRouter, Query
from pydantic import BaseModel

from gateway.core_client import CoreClient

router = APIRouter(prefix="/config", tags=["config"])
core_client = CoreClient()

class ConfigPayload(BaseModel):
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_base_url: str | None = None

@router.get("/global")
def get_global_config():
    return core_client.config_manager.get_global_config()

@router.post("/global")
def save_global_config(payload: ConfigPayload):
    # drop None values to avoid overwriting with empties if partial update
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    current = core_client.config_manager.get_global_config()
    current.update(updates)
    core_client.config_manager.save_global_config(current)
    return {"status": "ok", "config": current}

@router.get("/workspace")
def get_workspace_config(workspace_path: str = Query(..., min_length=1)):
    return core_client.config_manager.get_workspace_config(workspace_path)

@router.post("/workspace")
def save_workspace_config(payload: ConfigPayload, workspace_path: str = Query(..., min_length=1)):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    current = core_client.config_manager.get_workspace_config(workspace_path)
    current.update(updates)
    core_client.config_manager.save_workspace_config(workspace_path, current)
    return {"status": "ok", "config": current}
