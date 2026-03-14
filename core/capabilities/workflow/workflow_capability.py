from __future__ import annotations

from typing import Any

from orchestrator.contracts import ToolDefinition
from capabilities.capability import Capability
from capabilities.workflow.engine import WorkflowEngine
from capabilities.workflow.models import FlowStep, FlowTemplate
from capabilities.workflow.worker import WorkflowWorker


class WorkflowCapability(Capability):
    """
    流程引擎能力。将基于 YAML 的 SOP 能力挂载到主 Agent。
    """
    
    def __init__(self, workspace_path: str) -> None:
        self.engine = WorkflowEngine(workspace_path)
        self.worker = WorkflowWorker(self.engine)
        
    def get_system_prompts(self, session_id: str) -> list[str]:
        instances = self.engine.get_instances_for_session(session_id)
        waiting = [i for i in instances if i.state == "WAITING_FOR_USER"]
        if not waiting:
            return []
            
        msg = "【能力系统提示：后台工作流正在等待协作】\n当前有以下流程挂起，等待用户输入：\n"
        for i in waiting:
            msg += f"- 实例ID: {i.id}\n  需求: {i.pending_question}\n"
        msg += "\n如果用户在对话中提供了相关信息，请务必调用 `workflow.submit_flow_input` 传给后台。\n如果没有，请在回复中友好地引导用户回答该问题。"
        return [msg]

    def get_tools(self) -> list[ToolDefinition]:
        def create_template(args: dict[str, Any]) -> str:
            template_id = str(args.get("id", "")).strip()
            name = str(args.get("name", "")).strip()
            desc = str(args.get("description", "")).strip()
            
            steps = [
                FlowStep(
                    name=s.get("name", ""),
                    instruction=s.get("instruction", ""),
                    completion_condition=s.get("completion_condition")
                ) 
                for s in args.get("steps", [])
            ]
            
            template = FlowTemplate(id=template_id, name=name, description=desc, steps=steps)
            self.engine.save_template(template)
            return f"流程模板 [{name}] ({template_id}) 已保存至 workflows/ 目录下。"

        def list_templates(args: dict[str, Any]) -> str:
            templates = self.engine.list_templates()
            if not templates: return "没有任何流程模板。"
            res = ["当前本地模板："]
            for t in templates:
                res.append(f"- {t.id} | {t.name} ({len(t.steps)}步)")
            return "\n".join(res)

        def start_flow(args: dict[str, Any]) -> str:
            session_id = args.get("__session_id")
            template_id = args.get("template_id", "").strip()
            if not session_id: return "缺少上下文。"
            
            tpl = self.engine.get_template(template_id)
            if not tpl: return "未找到该模板。"
            
            inst = self.engine.create_instance(session_id, template_id)
            self.worker.run_async(inst.id)
            return f"流程已启动 (ID: {inst.id})。它将在后台异步执行。"

        def list_active_flows(args: dict[str, Any]) -> str:
            session_id = args.get("__session_id")
            if not session_id: return "缺少上下文。"
            active = [i for i in self.engine.get_instances_for_session(session_id) if i.state in ("RUNNING", "WAITING_FOR_USER", "PAUSED")]
            if not active: return "当前没有运行中的流程。"
            res = ["活跃流程："]
            for i in active:
                res.append(f"- ID: {i.id} | 状态: {i.state} | 当前在第 {i.current_step_index+1} 步")
                if i.state == "WAITING_FOR_USER":
                    res.append(f"  [等待输入]: {i.pending_question}")
            return "\n".join(res)

        def submit_flow_input(args: dict[str, Any]) -> str:
            instance_id = args.get("instance_id", "")
            input_data = args.get("input_data", {})
            inst = self.engine.get_instance(instance_id)
            if not inst: return "找不到实例。"
            if inst.state != "WAITING_FOR_USER": return f"实例状态为 {inst.state}。"
            
            inst.context_data.update(input_data)
            inst.state = "RUNNING"
            inst.pending_question = None
            self.engine.save_instance(inst)
            self.worker.run_async(inst.id)
            return "输入提交成功，后台已恢复运行！"

        return [
            ToolDefinition(
                name="workflow.create_template",
                description="创建 SOP 工作流模板 (YAML)",
                parameters={
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "steps": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "instruction": {"type": "string"},
                                    "completion_condition": {"type": "string"}
                                },
                                "required": ["name", "instruction"]
                            }
                        }
                    },
                    "required": ["id", "name", "steps"]
                },
                handler=create_template
            ),
            ToolDefinition(
                name="workflow.list_templates",
                description="列出所有本地 SOP 模板",
                parameters={"type": "object", "properties": {}},
                handler=list_templates
            ),
            ToolDefinition(
                name="workflow.start_flow",
                description="在后台启动一个工作流实例",
                parameters={"type": "object", "properties": {"template_id": {"type": "string"}}, "required": ["template_id"]},
                handler=start_flow
            ),
            ToolDefinition(
                name="workflow.list_active_flows",
                description="查看运行中和挂起的流程",
                parameters={"type": "object", "properties": {}},
                handler=list_active_flows
            ),
            ToolDefinition(
                name="workflow.submit_flow_input",
                description="向处于 WAITING_FOR_USER 的流程提供它所需的变量，恢复其运行",
                parameters={
                    "type": "object",
                    "properties": {
                        "instance_id": {"type": "string"},
                        "input_data": {"type": "object"}
                    },
                    "required": ["instance_id", "input_data"]
                },
                handler=submit_flow_input
            )
        ]
