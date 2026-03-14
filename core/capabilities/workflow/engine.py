from __future__ import annotations

import json
import uuid
import yaml
from pathlib import Path

from capabilities.workflow.models import FlowTemplate, FlowInstance


class WorkflowEngine:
    def __init__(self, workspace_path: str) -> None:
        self.workspace_path = workspace_path
        self.instance_dir = Path(workspace_path) / ".rhythm" / "flow_instances"
        self.instance_dir.mkdir(parents=True, exist_ok=True)
        
    def _template_dir(self) -> Path:
        d = Path(self.workspace_path) / "workflows"
        d.mkdir(parents=True, exist_ok=True)
        return d
        
    def save_template(self, template: FlowTemplate) -> None:
        target = self._template_dir() / f"{template.id}.yaml"
        with open(target, "w", encoding="utf-8") as f:
            yaml.safe_dump(template.to_dict(), f, allow_unicode=True, sort_keys=False, default_flow_style=False)
        
    def list_templates(self) -> list[FlowTemplate]:
        d = self._template_dir()
        res = []
        for p in d.glob("*.yaml"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                res.append(FlowTemplate.from_dict(data))
            except Exception:
                pass
        for p in d.glob("*.json"):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                res.append(FlowTemplate.from_dict(data))
            except Exception:
                pass
        return res
        
    def get_template(self, template_id: str) -> FlowTemplate | None:
        p_yaml = self._template_dir() / f"{template_id}.yaml"
        if p_yaml.exists():
            try:
                with open(p_yaml, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                return FlowTemplate.from_dict(data)
            except Exception:
                pass
                
        p_json = self._template_dir() / f"{template_id}.json"
        if p_json.exists():
            try:
                return FlowTemplate.from_dict(json.loads(p_json.read_text(encoding="utf-8")))
            except Exception:
                pass
        return None

    def _instance_path(self, instance_id: str) -> Path:
        return self.instance_dir / f"{instance_id}.json"

    def get_instance(self, instance_id: str) -> FlowInstance | None:
        p = self._instance_path(instance_id)
        if p.exists():
            try:
                return FlowInstance.from_dict(json.loads(p.read_text(encoding="utf-8")))
            except Exception:
                return None
        return None
        
    def get_instances_for_session(self, session_id: str) -> list[FlowInstance]:
        res = []
        for p in self.instance_dir.glob("*.json"):
            try:
                inst = FlowInstance.from_dict(json.loads(p.read_text(encoding="utf-8")))
                if inst.session_id == session_id:
                    res.append(inst)
            except Exception:
                pass
        return res
        
    def save_instance(self, instance: FlowInstance) -> None:
        p = self._instance_path(instance.id)
        p.write_text(json.dumps(instance.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        
    def create_instance(self, session_id: str, template_id: str) -> FlowInstance:
        inst_id = str(uuid.uuid4())
        inst = FlowInstance(
            id=inst_id, 
            session_id=session_id, 
            template_id=template_id, 
            workspace_path=self.workspace_path,
            state="RUNNING"
        )
        self.save_instance(inst)
        return inst
