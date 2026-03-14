from __future__ import annotations

from datetime import datetime
from pathlib import Path


def get_time(_: dict) -> str:
    return datetime.now().isoformat(timespec="seconds")


def list_sessions(arguments: dict) -> str:
    workspace_path = arguments.get("__workspace_path")
    if not workspace_path:
        return "错误：缺少工作区路径"
        
    root = Path(workspace_path) / ".rhythm" / "sessions"
    if not root.exists():
        return "当前没有会话记录"
        
    sessions = sorted(p.stem for p in root.glob("*.json"))
    if not sessions:
        return "当前没有会话记录"
    return "会话列表: " + ", ".join(sessions)


def write_text_file(arguments: dict) -> str:
    filename = str(arguments.get("filename", "")).strip()
    content = str(arguments.get("content", ""))
    workspace_path = arguments.get("__workspace_path")
    
    if not filename:
        raise ValueError("filename 不能为空")
    safe_name = filename.replace("\\", "/").split("/")[-1]
    if not safe_name:
        raise ValueError("filename 无效")
    if "." not in safe_name:
        safe_name = f"{safe_name}.md"
        
    if workspace_path:
        target_dir = Path(workspace_path)
    else:
        target_dir = Path.cwd()
        
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / safe_name
    target_path.write_text(content, encoding="utf-8")
    return f"文档已保存: {target_path.as_posix()}"
