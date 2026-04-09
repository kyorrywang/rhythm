# Rhythm

Rhythm 是一个面向本地开发场景的桌面 Agent 工作台，使用 `React 19 + Tauri 2 + Rust` 构建。项目将会话交互、工具执行、权限确认、插件扩展、工作流、定时任务和多代理能力放在同一套本地运行时中。

它的目标不是提供一个单纯的桌面聊天界面，而是作为一个可扩展的本地 Agent 宿主。

## 项目概览

- 前端负责工作台 UI、流式事件渲染和插件宿主
- 后端负责 Agent 执行引擎、工具系统、权限控制和本地能力桥接
- 插件系统负责承载大部分产品能力扩展，包括视图、命令、工具、技能和设置

## 核心能力

### 流式 Agent 运行时

Rhythm 的核心入口是 `chat_stream`。一次请求进入后，后端会为当前工作区动态组装运行时上下文，包括：

- 系统提示与环境信息
- 技能列表与项目级指令
- Memory 内容
- MCP server 能力
- 内置工具与插件工具
- 权限与 hooks

随后由 `QueryEngine` 驱动完整的工具调用循环。前端通过 Tauri `Channel` 接收事件流，将 `thinking`、文本增量、工具状态、权限请求、子代理生命周期、上下文压缩和 usage 更新映射到 session timeline。

### 分层 Prompt 组装

后端 Prompt Builder 不是静态字符串，而是按层拼装运行时提示，主要包含：

- 基础角色说明
- 当前环境信息
- 可用技能
- 项目 `RHYTHM.md`
- Memory 与相关记忆片段
- 用户自定义系统提示
- 权限/行为模式说明
- 协调者或子代理附加指令

这种设计让不同工作区、不同模式、不同代理角色可以共享一条稳定的 prompt 组装链路。

### 工具执行与权限控制

内置工具包括：

- `shell`
- `read`
- `write`
- `edit`
- `delete`
- `list_dir`
- `ask`
- `plan`
- `subagent`
- `skill`

所有工具通过统一 `BaseTool + ToolRegistry` 接口注册。一次工具调用会经过：

- pre-tool hook
- 权限判定
- 用户确认或协作权限同步
- 工具执行
- post-tool hook
- 结果回灌下一轮推理

权限模式目前支持：

- `default`
- `plan`
- `full_auto`

### 上下文治理

Agent Loop 在多轮对话和工具调用过程中会持续估算上下文规模，并在接近限制时触发 Auto Compact。当前支持：

- micro compact
- full compact

压缩结果会通过事件流显式通知前端。

### 插件系统

插件系统承担了 UI 和运行时扩展的主要职责。一个插件可以贡献：

- activity bar 项
- left panel / workbench / overlay 视图
- commands
- agent tools
- skills
- settings section
- workspace-scoped storage

插件可从以下位置发现：

- 用户目录插件
- 项目 `.rhythm/plugins`
- 仓库本地 `plugins/`

插件系统同时支持依赖检查、权限声明、启停控制、安装预览和运行时诊断。

### 命令面统一

插件通过 `ctx.commands.execute(...)` 和 `ctx.commands.start(...)` 使用统一命令入口。命令可以由以下几类实现提供：

- UI runtime handler
- 后端插件命令
- 对内置工具的封装
- 带流式 stdout/stderr 的长任务

这条命令面同时服务于 UI、插件互调、工作流节点执行和部分 Agent 能力桥接。

### Workflow、MCP、Memory、Cron、Swarm

除基础会话能力外，Rhythm 当前还包含几类平台模块：

- `workflow`：工作流定义、节点执行、运行跟踪与取消
- `mcp`：外部工具与资源接入
- `memory`：项目记忆索引与检索
- `cron`：定时任务注册与执行
- `swarm`：多代理注册、团队生命周期与权限同步

这些模块都挂在同一套本地运行时下，而不是互相独立的外围功能。

## 架构

```text
Frontend (React / Zustand / Tailwind)
  -> App Shell / Sidebar / MainStage / Workbench / Overlay
  -> Session Timeline / Composer / Plugin Host
  -> Tauri IPC Commands + Channel Event Stream

Desktop Runtime (Tauri 2)
  -> Native desktop lifecycle
  -> IPC bridge

Backend (Rust)
  -> Commands
  -> QueryEngine / AgentLoop
  -> Prompt Builder
  -> ToolRegistry / PermissionChecker / HookExecutor
  -> MCP / Memory / Skills / Cron / Swarm / Plugins

Extension Layer
  -> core / folder / developer / workflow
```

## 前端结构

前端主要分为三层：

- `src/features`
  负责会话、布局、侧边栏、设置等业务模块
- `src/shared`
  负责状态、类型、主题、通用 UI、Tauri API 封装
- `src/plugin`
  负责插件 SDK、插件宿主和核心插件能力

关键前端模块包括：

- `PluginHostRuntime`
  负责插件发现、加载、激活和卸载
- `useLLMStream`
  负责消费后端事件流，并将其映射为前端 session 状态
- `MainStage`
  负责 Session 与 Workbench 的布局关系

## 后端结构

Rust 侧大致可以分为以下模块：

### Commands

对前端暴露 Tauri 命令，包括：

- 聊天与中断
- 会话读写
- 工作区文件与终端访问
- 插件管理与插件命令
- 设置与记忆管理
- 定时任务管理

### Engine

`QueryEngine` 和 `agent_loop` 负责：

- 调用模型流
- 接收文本与工具调用事件
- 执行工具
- 写回工具结果
- 处理中断和上下文压缩

### Runtime Support

引擎周边模块负责运行时治理与扩展：

- `prompts`
- `permissions`
- `hooks`
- `skills`
- `memory`
- `plugins`
- `mcp`
- `swarm`

## 插件生态

仓库当前内置了几类官方插件：

### `core`

- 提供会话、插件、设置等基础界面
- 暴露 `core.llm.complete` 等宿主级命令

### `folder`

- 提供工作区文件树与文件预览
- 提供部分文件操作命令

### `developer`

- 提供命令日志、Diff、Validation 等开发视图
- 提供 git 和验证相关命令

### `workflow`

- 提供工作流面板、编辑器、运行视图和节点检查器
- 在插件内部维护自己的节点执行器注册表与运行时

## 目录

```text
src/                  React 前端
src/features/         业务模块
src/plugin/           插件 SDK 与宿主
src/shared/           公共状态、类型、UI、API 封装
src-tauri/src/        Rust 后端
plugins/              官方插件与模板
docs/                 插件架构与 SDK 文档
```

## 设计取向

从当前实现来看，Rhythm 的几个主要设计取向是：

- 本地优先，工作区、终端、文件系统都是一等能力
- 尽量把产品能力放入插件层，而不是持续膨胀 core
- 用统一事件流表达会话、工具、权限和子代理状态
- 用统一命令面连接 UI、插件和部分后端 runtime

这使它更接近一个可扩展的本地 Agent 宿主，而不是一个仅承载聊天界面的桌面应用。

## License

本项目采用 [MIT License](./LICENSE) 开源。
