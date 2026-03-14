from __future__ import annotations

import json
from artifacts.artifact_service import ArtifactService
from llm.model_router import ModelRouter
from memory.project_store import ProjectStore
from memory.session_store import SessionStore
from orchestrator.contracts import ChatMessage, RuntimeRequest, ToolDefinition
from orchestrator.planner import Planner
from tools.builtin.io import get_time, list_sessions, write_text_file

from agents.primary_agent import PrimaryAgent
from capabilities.workflow.workflow_capability import WorkflowCapability
from project.workspace import WorkspaceManager


class OrchestratorRuntime:
    def __init__(self) -> None:
        self.planner = Planner()
        self.model_router = ModelRouter()
        self.workspace_manager = WorkspaceManager()

    def handle_chat_stream(self, request: RuntimeRequest):
        # 0. 确保工作区初始化
        workspace_path = request.workspace_path or "."
        self.workspace_manager.init_workspace(workspace_path)

        # 实例化作用域在当前请求/工作区的存储
        session_store = SessionStore(workspace_path)
        project_store = ProjectStore(workspace_path)
        artifact_service = ArtifactService(workspace_path)

        # 1. 实例化 PrimaryAgent 并挂载工具
        llm = self.model_router.get_client(
            workspace_path=workspace_path,
            api_key=request.api_key,
            base_url=request.base_url,
            model=request.model
        )
        agent = PrimaryAgent(llm)
        
        # 注册内置通用工具
        agent.register_tools([
            ToolDefinition(name="builtin.get_time", description="获取时间", parameters={"type": "object", "properties": {}}, handler=get_time),
            ToolDefinition(name="builtin.list_sessions", description="查会话", parameters={"type": "object", "properties": {}}, handler=list_sessions),
            ToolDefinition(
                name="builtin.write_text_file",
                description="保存文本到文件",
                parameters={"type": "object", "properties": {"filename": {"type": "string"}, "content": {"type": "string"}}, "required": ["filename", "content"]},
                handler=write_text_file
            )
        ])
        
        # 2. 动态挂载能力 (Capabilities)
        workflow_capability = WorkflowCapability(workspace_path)
        agent.add_capability(workflow_capability)
        
        # 3. 追加用户消息
        agent.notify_capabilities_message(request.session_id, request.user_message)
        session_store.append(
            request.session_id,
            ChatMessage(role="user", content=request.user_message)
        )
        
        plan = self.planner.build_plan(request.user_message)
        
        # 4. 执行 PrimaryAgent 的 ReAct Loop
        while True:
            history = session_store.load(request.session_id)
            
            # 挂载扩展能力注入的 System Prompts
            prompts = agent.get_capability_prompts(request.session_id)
            if prompts:
                history.append(ChatMessage(role="system", content="\n\n".join(prompts)))

            assistant_msg, tool_results = agent.run_step(history)
            
            if not assistant_msg.tool_calls or not plan.requires_tool_use:
                break
                
            session_store.append(request.session_id, assistant_msg)

            for call_dict in assistant_msg.tool_calls:
                args_str = call_dict["function"]["arguments"]
                try:
                    args = json.loads(args_str)
                    args["__workspace_path"] = workspace_path
                    args["__session_id"] = request.session_id
                    call_dict["function"]["arguments"] = json.dumps(args)
                except:
                    pass

            artifact_ids: list[str] = []
            for item in tool_results:
                from tool_use.result_normalizer import normalize_tool_result
                norm = normalize_tool_result(item)
                artifact_ids.append(artifact_service.create(request.session_id, norm))

            project_store.save_project_state(
                {
                    "last_session_id": request.session_id,
                    "artifact_ids": artifact_ids,
                }
            )

            metadata = json.dumps({
                "type": "metadata",
                "session_id": request.session_id,
                "used_tools": [{"name": t.name, "ok": t.ok, "output": str(t.output)} for t in tool_results],
                "artifact_ids": artifact_ids
            })
            yield f"data: {metadata}\n\n"

            for res in tool_results:
                tool_msg = ChatMessage(
                    role="tool",
                    content=str(res.output),
                    tool_call_id=res.id,
                    name=res.name
                )
                session_store.append(request.session_id, tool_msg)

        final_reply = ""
        clean_history = session_store.load(request.session_id)
        
        prompts = agent.get_capability_prompts(request.session_id)
        if prompts:
            clean_history.append(ChatMessage(role="system", content="\n\n".join(prompts)))
            
        for chunk in agent.llm.finalize_stream(clean_history):
            final_reply += chunk
            chunk_data = json.dumps({"type": "chunk", "content": chunk})
            yield f"data: {chunk_data}\n\n"

        if final_reply:
            session_store.append(
                request.session_id,
                ChatMessage(role="assistant", content=final_reply),
            )
        yield "data: [DONE]\n\n"
