from __future__ import annotations

from typing import Any

from agents.sub_agent import SubAgent
from llm.model_router import ModelRouter
from orchestrator.contracts import ToolDefinition
from capabilities.workflow.engine import WorkflowEngine


class WorkflowWorker:
    """封装 SubAgent 用于执行单个工作流步骤的逻辑"""
    
    def __init__(self, engine: WorkflowEngine) -> None:
        self.engine = engine
        self.model_router = ModelRouter()

    def run_async(self, instance_id: str) -> None:
        inst = self.engine.get_instance(instance_id)
        if not inst or inst.state != "RUNNING":
            return
            
        tpl = self.engine.get_template(inst.template_id)
        if not tpl:
            inst.state = "FAILED"
            self.engine.save_instance(inst)
            return
            
        if inst.current_step_index >= len(tpl.steps):
            inst.state = "COMPLETED"
            self.engine.save_instance(inst)
            return
            
        step = tpl.steps[inst.current_step_index]
        
        # 变量插值
        try:
            prompt = step.instruction.format(**inst.context_data)
        except KeyError as e:
            prompt = step.instruction + f"\n(注：变量 {e} 未提供)"
        except Exception:
            prompt = step.instruction
            
        objective = (
            f"正在执行流程【{tpl.name}】的第 {inst.current_step_index + 1}/{len(tpl.steps)} 步：【{step.name}】。\n"
            f"指令：{prompt}\n\n"
            f"完成条件：{step.completion_condition or '自行判断'}\n\n"
            "【强制守则】\n"
            "如果你需要询问用户，请调用 `workflow.subagent_ask_user` 工具并等待。\n"
            "如果你认为本步骤任务已完成，必须调用 `workflow.subagent_finish_step` 把结构化结果传递给下一步！\n"
            "切勿在不调用上述两个工具的情况下自行结束对话。"
        )
        
        # 创建新的 SubAgent 实例处理这一步任务
        agent = SubAgent(self.model_router.get_client(), objective)
        
        def finish_step(args: dict[str, Any]) -> str:
            output_data = args.get("output_data", {})
            if isinstance(output_data, dict):
                inst.context_data.update(output_data)
            inst.current_step_index += 1
            self.engine.save_instance(inst)
            
            # 当前步骤结束，停止这个 SubAgent
            agent.pause()
            
            # 递归启动下一步（它会再 spawn 一个新的 SubAgent 或发现已完结）
            self.run_async(instance_id)
            return "SUCCESS"
            
        def ask_user(args: dict[str, Any]) -> str:
            inst.state = "WAITING_FOR_USER"
            inst.pending_question = args.get("question", "需要更多输入。")
            inst.required_keys = args.get("required_keys", [])
            self.engine.save_instance(inst)
            
            # 等待前台用户输入，当前 SubAgent 挂起
            agent.pause()
            return "SUCCESS"
            
        agent.register_tools([
            ToolDefinition(
                name="workflow.subagent_ask_user",
                description="向主聊天窗口抛出问题，等待用户回答后再继续。",
                parameters={
                    "type": "object",
                    "properties": {
                        "question": {"type": "string", "description": "要询问用户的问题"},
                        "required_keys": {
                            "type": "array", 
                            "items": {"type": "string"},
                            "description": "期望获得的变量名列表"
                        }
                    },
                    "required": ["question"]
                },
                handler=ask_user
            ),
            ToolDefinition(
                name="workflow.subagent_finish_step",
                description="宣告本步骤完成，并将提取的产出数据传递给下一步。",
                parameters={
                    "type": "object",
                    "properties": {
                        "output_data": {
                            "type": "object", 
                            "description": "JSON字典格式的数据，将合入全局 Context"
                        }
                    }
                },
                handler=finish_step
            )
        ])
        
        agent.run_async()
