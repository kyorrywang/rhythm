from fastapi import APIRouter
from pydantic import BaseModel
from pathlib import Path
from gateway.core_client import CoreClient

router = APIRouter(prefix="/workspace", tags=["workspace"])
core_client = CoreClient()

class InitWorkspaceRequest(BaseModel):
    workspace_path: str

@router.post("/init")
def init_workspace(req: InitWorkspaceRequest):
    core_client.init_workspace(req.workspace_path)
    return {"status": "ok", "workspace_path": req.workspace_path}

@router.get("/tree")
def list_workspace_tree(path: str):
    target_dir = Path(path)
    if not target_dir.exists() or not target_dir.is_dir():
        return {"tree": []}
        
    def build_tree(current_path: Path, max_depth=3, current_depth=0):
        if current_depth > max_depth:
            return []
        items = []
        try:
            for p in current_path.iterdir():
                # ignore some hidden dirs
                if p.name in [".git", ".rhythm", "node_modules", "__pycache__"]:
                    continue
                item = {
                    "name": p.name,
                    "is_dir": p.is_dir(),
                    "path": str(p.absolute())
                }
                if p.is_dir():
                    item["children"] = build_tree(p, max_depth, current_depth + 1)
                items.append(item)
        except Exception:
            pass
        return sorted(items, key=lambda x: (not x["is_dir"], x["name"]))

    return {"tree": build_tree(target_dir)}
