# Workflow Lite Execution Plan

## 1. 目标

本文给出 Workflow Lite 的执行计划，目标是在不推翻现有 `plugins/workflow` 结构的前提下，分阶段把当前工作流插件演进成一个：

- 可运行
- 可暂停
- 可恢复
- 以 LLM 为核心
- 以判断/循环为主要控制流

的轻量工作流引擎。

## 2. 当前基础

当前代码中已经具备的能力：

- `plugins/workflow/src/types.ts`
  已有 WorkflowDefinition / WorkflowRun / WorkflowNodeRun 等基础结构

- `plugins/workflow/src/runtime.ts`
  已有 runWorkflow / cancelWorkflowRun / executeWorkflow 的基础执行链路

- `plugins/workflow/src/nodeRegistry.ts`
  已有节点注册器与内置节点

- `plugins/workflow/src/storage.ts`
  已有 definitions / runs / settings 持久化

- `plugins/workflow/src/components/*`
  已有 panel / editor / run view / inspector / settings UI 宿主

所以这次不是从零开始，而是在现有插件基础上重构 runtime 和数据模型。

## 3. 总体策略

遵循三条主线并行推进：

### 3.1 Runtime 主线

先把执行引擎与状态机做稳。

### 3.2 Node 主线

把节点集合收敛到 LLM-first 模型。

### 3.3 UI 主线

优先强化 Run View 和 Inspector，编辑器画布体验放后。

## 4. 阶段拆分

## Phase 0 - 基线整理

### 目标

在正式扩展前，先统一概念与现有实现。

### 工作项

1. 梳理当前节点与目标节点映射
2. 明确 `manual` 将演进为 `start`
3. 明确 `workflow.llm` 将演进为标准 `llm`
4. 评估 `shell / command` 是否保留为内部调试节点
5. 为 run / nodeRun 状态新增 `paused`

### 建议修改文件

- `plugins/workflow/src/types.ts`
- `plugins/workflow/src/utils.ts`
- `plugins/workflow/src/nodeRegistry.ts`

### 交付标准

- 类型层能表达 paused / checkpoint / variables
- 基础节点命名不再混乱

## Phase 1 - Runtime MVP

### 目标

把 Workflow 从“顺序执行器”升级成“可恢复的运行时”。

### 核心能力

- run state machine
- node state machine
- checkpoint
- pauseRequested
- resume

### 工作项

1. 扩展 `WorkflowRun`
   - 增加 `currentNodeId`
   - 增加 `resumeFromNodeId`
   - 增加 `variables`
   - 增加 `checkpointVersion`
   - 增加 `executionStack`

2. 扩展 `WorkflowNodeRun`
   - 增加 `paused`
   - 增加 `attempt`
   - 增加 `checkpoint`

3. 重构 `runtime.ts`
   - 将 `executeWorkflow` 拆为更明确的阶段函数
   - 引入 run controller
   - 支持 pauseRequested
   - 节点边界保存 checkpoint

4. 新增 run 恢复入口
   - `resumeWorkflowRun(runId)`

5. 明确 cancel 语义
   - cancel 后不可 resume

### 建议新增/修改文件

- `plugins/workflow/src/runtime.ts`
- `plugins/workflow/src/types.ts`
- `plugins/workflow/src/storage.ts`
- `plugins/workflow/src/commands.ts`

### 交付标准

- 一个线性 workflow 可以 run / pause / resume / cancel
- pause 在节点边界稳定生效
- 应用重开后可从持久化 run 恢复

## Phase 2 - LLM Node 标准化

### 目标

把当前 `workflow.llm` 从简单命令包装升级为标准核心节点。

### 核心能力

- `text` 输出
- `json` 输出
- schema 校验
- 错误可解释

### 工作项

1. 定义 `llm` 节点标准 config
   - `prompt`
   - `systemPrompt`
   - `providerId`
   - `model`
   - `timeoutSecs`
   - `outputMode`
   - `outputSchema`

2. 重构 `nodeRegistry.ts`
   - 把 `workflow.llm` 改造成正式 `llm` 节点

3. 新增输出解析逻辑
   - 文本直接返回
   - JSON 模式解析
   - schema 模式校验

4. 在 Run View 展示
   - prompt 输入
   - 结构化输出
   - 校验错误

### 建议修改文件

- `plugins/workflow/src/nodeRegistry.ts`
- `plugins/workflow/src/types.ts`
- `plugins/workflow/src/components/WorkflowNodeInspector.tsx`
- `plugins/workflow/src/components/WorkflowRunView.tsx`

### 交付标准

- `llm` 节点可以输出 JSON
- 结构化结果可被后续节点稳定消费

## Phase 3 - If Node

### 目标

引入最小可用条件分支。

### 核心能力

- 基于变量判断
- true / false 分支
- default 分支可选

### 工作项

1. 增加 `if` 节点类型
2. 扩展 edge 定义
   - 增加 `branch`
3. 定义最小判断表达式
   - `equals`
   - `exists`
   - `greater_than`
4. 运行时支持分支跳转
5. Inspector 支持配置条件

### 建议修改文件

- `plugins/workflow/src/types.ts`
- `plugins/workflow/src/nodeRegistry.ts`
- `plugins/workflow/src/runtime.ts`
- `plugins/workflow/src/components/WorkflowNodeInspector.tsx`
- `plugins/workflow/src/components/WorkflowGraphCanvas.tsx`

### 交付标准

- `start -> llm -> if -> end`
  可以完整跑通

## Phase 4 - Loop Node

### 目标

在不引入并行复杂度的前提下支持最小循环。

### 核心能力

- `for_each`
- `repeat_until`
- `maxIterations`
- loop frame checkpoint

### 工作项

1. 增加 `loop` 节点类型
2. 在 runtime 中新增 `executionStack`
3. 实现 loop frame 恢复
4. 暴露 `loop.index` / `loop.item`
5. 对无限循环做保护

### 建议修改文件

- `plugins/workflow/src/types.ts`
- `plugins/workflow/src/runtime.ts`
- `plugins/workflow/src/nodeRegistry.ts`
- `plugins/workflow/src/utils.ts`
- `plugins/workflow/src/components/WorkflowNodeInspector.tsx`

### 交付标准

- workflow 可稳定执行有限循环
- 暂停后可从 loop checkpoint 恢复

## Phase 5 - Run View 强化

### 目标

让用户真正“能用”这个工作流，而不是只能“看见它存在”。

### 必须能力

- run 状态总览
- 当前节点高亮
- 节点日志
- 节点输入/输出
- pause / resume / cancel / retry

### 工作项

1. Run View 顶部控制栏
2. 节点级时间线展示
3. 输入输出面板
4. 错误节点显式标识
5. 恢复点显示

### 建议修改文件

- `plugins/workflow/src/components/WorkflowRunView.tsx`
- `plugins/workflow/src/components/WorkflowPanel.tsx`
- `plugins/workflow/src/components/WorkflowEditorView.tsx`

### 交付标准

- 用户可以仅靠 Run View 完成观测和控制

## Phase 6 - 数据节点补强

### 目标

解决“所有数据处理都塞给 LLM”导致的混乱。

### 建议优先加入

- `set`
- `template`

### 工作项

1. 定义简单变量写入节点
2. 定义模板拼接逻辑
3. 让 prompt 组装不再过度依赖前一节点文本输出

### 交付标准

- 常见工作流不需要为了拼一个 JSON 再多跑一次 LLM

## 5. 关键技术决策

## 5.1 Pause 只在节点边界生效

原因：

- 最容易保证语义稳定
- 与持久化 checkpoint 匹配
- 避免处理中途流恢复的复杂性

决策：

- 一期不做 token 级恢复
- 正在运行的节点如果被 pause，请求结束后再进入 paused

## 5.2 Resume 的单位是 checkpoint，不是 token stream

决策：

- checkpoint 发生在节点结束后
- 如果中途被中断，则从当前节点重试

## 5.3 Workflow 状态直接落盘到插件存储

决策：

- 继续复用 `storage.ts`
- 初期无需新增数据库
- 先把状态模型做对

## 5.4 单线程优先

决策：

- 一期不做并行 edge
- 一期不做 join / merge
- 先保证顺序执行与控制流正确

## 6. 代码层建议重构

## 6.1 `types.ts`

重点：

- 升级 WorkflowRun / WorkflowNodeRun
- 新增 checkpoint / frame / variable 类型

## 6.2 `runtime.ts`

建议拆分为：

- `runWorkflow`
- `resumeWorkflowRun`
- `pauseWorkflowRun`
- `cancelWorkflowRun`
- `executeNode`
- `resolveNextNode`
- `saveCheckpoint`

如果逻辑继续集中在一个文件里，后面 loop 和 retry 会快速变乱。

## 6.3 `nodeRegistry.ts`

建议把“节点元数据”和“节点执行器”进一步分层：

- type definition
- config definition
- runtime executor

这样 Inspector 和 runtime 都更容易复用。

## 6.4 `storage.ts`

建议新增方法：

- `updateRun`
- `saveCheckpoint`
- `listActiveRuns`
- `getLatestRecoverableRun`

## 7. UI 实施顺序

正确顺序建议是：

1. Inspector
2. Run View
3. Panel 状态筛选
4. Editor 交互增强

不建议顺序：

1. 先做复杂画布
2. 再补运行控制

原因很简单，Workflow Lite 的价值在运行时，不在画布炫技。

## 8. 验收用例

## 用例 1：基础 LLM

流程：

- `start -> llm -> end`

期望：

- 正常执行
- 输出可见
- run 历史可回看

## 用例 2：结构化判断

流程：

- `start -> llm(json) -> if -> llm / end`

期望：

- if 可读取 JSON 字段
- 分支跳转正确

## 用例 3：暂停恢复

流程：

- `start -> llm -> llm -> end`

操作：

- 第一节点完成后暂停
- 关闭应用
- 重开后恢复

期望：

- 从第二节点继续

## 用例 4：循环

流程：

- `start -> loop(for_each) -> llm -> end`

期望：

- 迭代变量正确
- 超过最大次数会保护退出或报错

## 用例 5：失败重试

流程：

- `start -> llm(json invalid) -> if -> end`

期望：

- 节点 error
- 修正配置后可 retry 当前节点

## 9. 风险与规避

### 风险 1：类型模型仍然过于字符串化

表现：

- `config` 全是 string
- schema / loop / if 变得难维护

规避：

- 尽早把 config 改为 `Record<string, unknown>`

### 风险 2：Pause/Resume 语义不清

表现：

- UI 显示 paused，但实际恢复点不稳定

规避：

- 明确只在节点边界 checkpoint

### 风险 3：LLM 输出不稳定

表现：

- if / loop 经常跑飞

规避：

- 默认鼓励 JSON 输出
- 增加 schema 校验

### 风险 4：编辑器先变复杂，运行时却不可靠

规避：

- 把 Run View 和 runtime 排在 Editor 画布之前

## 10. 推荐里程碑

### M1

- paused 状态
- checkpoint
- resume
- 基础 run view 控制

### M2

- 标准 `llm` 节点
- JSON 输出
- schema 校验

### M3

- `if` 节点
- 分支 edge

### M4

- `loop` 节点
- execution stack

### M5

- `set/template`
- retry node
- 更完整的观测与调试体验

## 11. 最终建议

这件事最值得坚持的方向不是“多快做成 n8n 的样子”，而是：

- 把 Workflow 做成 Rhythm 内部稳定的小型运行时
- 把 LLM 作为真正的核心节点
- 把 if / loop 做成围绕 LLM 的控制流
- 把 pause / resume 做成可信能力

只要这条主线走稳，后续无论是扩节点、接 Agent、做 Trigger，都会顺很多。
