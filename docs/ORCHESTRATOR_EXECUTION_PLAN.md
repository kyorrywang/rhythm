# Agent 编排引擎开发阶段规划

## 1. 文档目的

本文档用于规划 `plugins/orchestrator` 的完整开发阶段。

目标是将前面已经确认的几份标准文档，拆解成可执行、可验收、可逐步上线的工程计划。

本文档是开发排期、阶段验收与范围控制的依据。

## 2. 已确定的前提

在进入开发前，以下前提已经明确：

- 产品名称固定为 `Agent 编排引擎`
- `plugins/orchestrator` 是新插件
- `workflow` 一期不作为主视图对象
- 会话区仍然是主入口之一
- `orchestrator` 的主控对象是主 Agent
- 主 Agent 是“可被反复唤醒的流程调度器”
- `Pause` 与 `Resume` 是一期核心能力
- 模板编辑器采用：
  - `Stage Board`
  - `Agent Board`
- 运行中页面采用：
  - 类会话运行记录
  - 无底部输入框

相关标准文档：

- [AGENT_ORCHESTRATION_ENGINE.md](C:\Users\Administrator\Documents\dev\rhythm\docs\AGENT_ORCHESTRATION_ENGINE.md)
- [ORCHESTRATOR_PAUSE_RESUME_SPEC.md](C:\Users\Administrator\Documents\dev\rhythm\docs\ORCHESTRATOR_PAUSE_RESUME_SPEC.md)
- [ORCHESTRATOR_TEMPLATE_UI_SPEC.md](C:\Users\Administrator\Documents\dev\rhythm\docs\ORCHESTRATOR_TEMPLATE_UI_SPEC.md)

## 3. 总体策略

开发顺序遵循四条原则：

### 3.1 先 Runtime，后 UI

先把 Run、状态机、唤醒模型、Pause / Resume 做稳，再做复杂编辑体验。

### 3.2 先 Running，后 Templates

先让系统真的能跑起来，再做完整模板编辑器。

### 3.3 先接会话，后补工作台

因为会话已经是现有系统的重要入口，所以应先把 orchestrator 接入会话，再补独立工作台管理能力。

### 3.4 先最小模板，后复杂表达

一期模板先支持：

- row / column
- stages
- agents
- 基本配置

不做复杂依赖图。

## 4. 阶段总览

建议按以下阶段推进：

- Phase 0：插件基线与数据模型
- Phase 1：Run Runtime MVP
- Phase 2：会话集成 MVP
- Phase 3：Pause / Resume MVP
- Phase 4：Running 工作台
- Phase 5：Templates 工作台
- Phase 6：模板编辑器
- Phase 7：联调、验收与样例模板

## 5. Phase 0：插件基线与数据模型

### 5.1 目标

建立 `plugins/orchestrator` 的基础目录、类型系统、存储与命令入口。

### 5.2 工作项

- 新建 `plugins/orchestrator`
- 建立插件注册、面板入口、命令入口
- 定义基础类型：
  - Template
  - Stage Row
  - Agent Row
  - Run
  - Run Event
  - Agent Task
  - Control Intent
- 定义基础存储：
  - templates
  - runs
  - events
  - tasks
- 建立基础 command skeleton

### 5.3 建议文件

- `plugins/orchestrator/src/index.ts`
- `plugins/orchestrator/src/types.ts`
- `plugins/orchestrator/src/storage.ts`
- `plugins/orchestrator/src/commands.ts`
- `plugins/orchestrator/src/constants.ts`

### 5.4 交付标准

- 插件可加载
- 可读写 orchestrator 基础存储
- 基础类型可用于后续开发

## 6. Phase 1：Run Runtime MVP

### 6.1 目标

先不做完整模板编辑器，先让编排 Run 能创建、推进、记录状态。

### 6.2 工作项

- 实现 Run 创建
- 实现 Run 状态机
- 实现主 Agent 调度轮次模型
- 实现最小事件流
- 实现最小任务表
- 定义主 Agent 唤醒输入结构
- 实现“启动一条 Run”命令

### 6.3 一期最小状态

- `pending`
- `running`
- `pause_requested`
- `paused`
- `completed`
- `failed`
- `cancelled`
- `interrupted`

### 6.4 建议文件

- `plugins/orchestrator/src/runtime.ts`
- `plugins/orchestrator/src/types.ts`
- `plugins/orchestrator/src/storage.ts`
- `plugins/orchestrator/src/commands.ts`

### 6.5 交付标准

- 能创建 Run
- 能写入状态与事件
- 能完成至少一轮“唤醒主 Agent -> 写回决策结果”

## 7. Phase 2：会话集成 MVP

### 7.1 目标

让用户能从会话里自然语言发起一条 orchestrator run。

### 7.2 工作项

- 定义会话侧可调用命令
- 增加会话中的 run 卡片 / 超链接
- 支持从会话中：
  - 创建 Run
  - 打开 Run
  - 查询 Run 状态
- 将 Run 与来源会话建立关联

### 7.3 建议文件

- `plugins/orchestrator/src/tools/main.js`
- `plugins/orchestrator/src/commands.ts`
- 相关会话渲染卡片组件

### 7.4 交付标准

- 用户可在会话中发起一条 Run
- 会话中出现可点击入口
- 点击后能打开该 Run

## 8. Phase 3：Pause / Resume MVP

### 8.1 目标

落地主 Agent 唤醒模型，以及一期的 `Pause / Resume`。

### 8.2 工作项

- 实现 `pauseRequested`
- 实现活跃任务统计
- 实现 `Pause`
- 实现 `Resume`
- Resume 时从 SQL 重建结构化状态
- 定义 Resume 控制消息
- 确保主 Agent 不依赖长驻上下文

### 8.3 关键语义

- `Pause`：
  - 停止后续调度
  - 当前活跃任务自然收尾
- `Resume`：
  - 重建状态
  - 重新唤醒主 Agent

### 8.4 建议文件

- `plugins/orchestrator/src/runtime.ts`
- `plugins/orchestrator/src/commands.ts`
- `plugins/orchestrator/src/storage.ts`

### 8.5 交付标准

- 会话可 Pause
- 会话可 Resume
- 状态能从 `running -> pause_requested -> paused -> running`
- Resume 后 Run 能继续推进

## 9. Phase 4：Running 工作台

### 9.1 目标

补齐运行中的实例管理界面。

### 9.2 工作项

- Sidebar 增加 `Running`
- 展示 Run 列表
- 展示当前状态、模板、更新时间
- 打开 Run 详情页
- 增加 Pause / Resume / Cancel 控件
- 展示关键事件流
- 展示当前活跃 Agent / Task

### 9.3 视图重点

一期 Run 详情页优先展示：

- 状态
- 当前阶段
- 当前主 Agent
- 活跃子任务
- 事件流
- 完整运行记录

### 9.4 建议文件

- `plugins/orchestrator/src/components/OrchestratorPanel.tsx`
- `plugins/orchestrator/src/components/RunList.tsx`
- `plugins/orchestrator/src/components/RunView.tsx`

### 9.5 交付标准

- 用户可在工作台看到 running runs
- 可打开 Run 详情
- 可在工作台执行 Pause / Resume / Cancel

## 10. Phase 5：Templates 工作台

### 10.1 目标

建立模板列表、模板基本管理与手动创建能力。

### 10.2 工作项

- Sidebar 增加 `Templates`
- 模板列表展示
- 模板新建
- 模板保存
- 模板基础元信息编辑：
  - name
  - domain
  - version
  - description

### 10.3 建议文件

- `plugins/orchestrator/src/components/TemplateList.tsx`
- `plugins/orchestrator/src/components/TemplateMetaEditor.tsx`

### 10.4 交付标准

- 用户可创建模板
- 用户可编辑模板元信息
- 模板可持久化保存

## 11. Phase 6：模板编辑器

### 11.1 目标

落地 `Stage Board` 与 `Agent Board`。

### 11.2 工作项

- 模板主视图实现 `Stage Board`
- 支持 stage row / column 编辑
- 点击 stage 后进入 `Agent Board`
- 支持 agent row / column 编辑
- 点击 Agent 打开右侧配置面板
- 支持最小 Agent 配置字段编辑
- 预留 `executionMode / workflowId`

### 11.3 一期最小表达

- 顺序：通过 row 顺序表达
- 并发：通过同一 row 的多个 card 表达
- 不做复杂连线

### 11.4 建议文件

- `plugins/orchestrator/src/components/TemplateEditorView.tsx`
- `plugins/orchestrator/src/components/StageBoard.tsx`
- `plugins/orchestrator/src/components/AgentBoard.tsx`
- `plugins/orchestrator/src/components/AgentConfigDrawer.tsx`

### 11.5 交付标准

- 能编辑阶段板
- 能编辑阶段内 Agent 板
- 能配置单个 Agent

## 12. Phase 7：联调、验收与样例模板

### 12.1 目标

验证系统不是只“能编辑”，而是真的能跑通闭环。

### 12.2 工作项

- 准备至少 2 个样例模板
  - 小说模板
  - 软件模板
- 验证会话启动
- 验证工作台查看
- 验证 Pause / Resume
- 验证会话与工作台状态一致
- 补关键空态、错误态与边界提示

### 12.3 建议样例

- `novel.qidian.v1`
- `software.delivery.basic.v1`

### 12.4 交付标准

- 样例模板可运行
- 会话与工作台联动正常
- Pause / Resume 能跑通
- 文档中的一期验收项均通过

## 13. 推荐实施顺序

如果按最小风险推进，建议真实开发顺序如下：

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7

原因是：

- 先做运行时，能尽早验证唤醒模型
- 先接会话，能尽早验证用户主路径
- 先做 Pause / Resume，能尽早验证最难点
- 模板编辑器放后，避免过早陷入 UI 复杂度

## 14. 风险点与控制建议

### 14.1 过早做复杂图编辑

风险：

- UI 复杂度快速失控
- 消耗大量时间在画布体验上

建议：

- 一期坚持 `row / column board`
- 不引入连线编辑器

### 14.2 过早把 workflow 纳入主视图

风险：

- 产品心智退回 workflow 系统
- 分散编排器核心验证

建议：

- workflow 一期只保留兼容位
- 不做主视图整合

### 14.3 Resume 依赖完整聊天

风险：

- 长任务恢复不稳定

建议：

- 强制使用结构化状态重建
- 恢复材料从 SQL 摘要组装

### 14.4 一开始就把模板做得过于复杂

风险：

- 数据模型和 UI 同时失控

建议：

- 一期只支持 row / column
- 复杂依赖延后

## 15. 阶段验收门槛

每个阶段完成前，至少应满足：

### 15.1 Runtime 阶段

- 可创建 Run
- 可写状态
- 可写事件

### 15.2 会话阶段

- 会话能启动 Run
- 会话能打开 Run

### 15.3 Pause / Resume 阶段

- Pause 能进入 `pause_requested`
- 活跃任务结束后变为 `paused`
- Resume 能唤醒主 Agent

### 15.4 UI 阶段

- Running 可见
- Templates 可见
- Stage Board 可编辑
- Agent Board 可编辑

## 16. 一期完成定义

当以下能力全部成立时，可视为一期完成：

- 新插件 `plugins/orchestrator` 可用
- 会话可发起编排 Run
- Run 可在工作台查看
- Run 支持 Pause / Resume / Cancel
- 模板可创建与编辑
- 模板采用 `Stage Board + Agent Board`
- 运行态采用类会话视图
- 会话与工作台状态一致
- 至少 2 个样例模板跑通

## 17. 结论

`plugins/orchestrator` 的完整开发应按：

`基础模型 -> 运行时 -> 会话接入 -> Pause/Resume -> Running 工作台 -> Templates 工作台 -> 模板编辑器 -> 样例验收`

的顺序推进。

这样可以最大化复用现有系统基础，并最早验证真正困难的部分：主 Agent 唤醒模型与 Pause / Resume。
