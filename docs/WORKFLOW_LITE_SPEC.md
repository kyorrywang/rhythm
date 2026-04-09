# Workflow Lite Spec

## 1. 文档目标

本文定义 Rhythm Workflow 的轻量版目标形态。它不是通用自动化平台，也不是缩小版 n8n，而是一个以 `LLM` 为核心计算节点、以 `判断 / 循环 / 状态恢复` 为核心流程能力的轻工作流引擎。

目标是先做出一个稳定、可恢复、可迭代扩展的工作流运行时，再逐步扩大节点能力与生态。

## 2. 产品定位

### 2.1 要解决的问题

当前 Workflow 插件已经具备：

- workflow 定义存储
- 基本节点注册表
- 顺序执行
- run 记录持久化
- shell / command / workflow.llm 等基础节点

但还没有形成一个面向 `LLM orchestration` 的最小闭环。现阶段最重要的是把 Workflow 从“可演示的流程编辑器”推进成“可运行、可暂停、可恢复的小型执行引擎”。

### 2.2 本期产品定义

Workflow Lite 是：

- 单工作区内的轻量工作流引擎
- 以单次 run 为中心的状态机系统
- 以 LLM 节点为核心计算能力
- 以条件与循环节点为核心控制流能力
- 支持 run / pause / resume / cancel / retry 的运行时

Workflow Lite 不是：

- 完整版 n8n
- 多触发器集成平台
- 大量外部 SaaS 节点集合
- 一期就支持复杂并行调度的编排器

## 3. 设计原则

### 3.1 LLM First

工作流的主要业务价值来自 LLM 节点，其他节点主要用于围绕 LLM 构建控制流与上下文管理。

建议分层：

- `llm` 节点负责生成、理解、结构化抽取、决策建议
- `if / loop / set` 节点负责流程控制与变量流转

### 3.2 Runtime First

先做稳定运行时，再做复杂编辑器。

优先级：

1. 可运行
2. 可暂停
3. 可恢复
4. 可观测
5. 可视化编辑体验

### 3.3 Checkpoint First

暂停和恢复必须建立在显式 checkpoint 之上。不能依赖“重新从头跑一遍并碰巧得到同样结果”。

### 3.4 Structured Output First

LLM 节点必须优先支持结构化输出，否则判断与循环会非常脆弱。

### 3.5 Single-threaded First

一期不做复杂并行。单线程、确定性、可恢复，比并行更重要。

## 4. 范围定义

## 4.1 一期必须支持

- workflow 创建、编辑、保存
- run 启动
- run 暂停
- run 恢复
- run 取消
- 节点级状态与日志
- 节点级 checkpoint
- 结构化 LLM 输出
- 判断节点
- 循环节点

### 4.2 一期建议支持

- 从失败节点重试
- run 历史列表
- 节点输入/输出查看
- 简单变量引用
- 最大循环次数限制

### 4.3 明确不做

- 并行分支调度
- 子工作流调用
- 远程触发器
- Webhook/邮箱/数据库等大量外部节点
- 复杂的图布局系统
- 强类型表达式语言的完整实现

## 5. 节点模型

## 5.1 一期节点清单

### `start`

用途：

- 作为流程入口
- 提供初始输入上下文

说明：

- 一般不做实际计算
- 每个 workflow 只允许一个 start

### `llm`

用途：

- 文本生成
- 结构化抽取
- 分类判断
- 重写、总结、规划

核心配置：

- `prompt`
- `systemPrompt`
- `providerId` 可选
- `model` 可选
- `timeoutSecs`
- `outputMode`: `text | json`
- `outputSchema` 可选

输出要求：

- `text` 模式直接输出文本
- `json` 模式要求返回合法 JSON
- 如果配置了 schema，则需要校验结果结构

### `if`

用途：

- 基于变量或 LLM 输出决定分支

建议支持两种判断模式：

- `expression`
- `value_equals` / `value_exists` 这类简化模式

一期建议不要强依赖自然语言判断，优先依赖结构化字段，例如：

- `{{node.llm_1.output.decision}} == "approve"`
- `{{vars.score}} > 0.8`

输出：

- 只决定下一个分支，不产生复杂业务数据

### `loop`

用途：

- 对数组逐项处理
- 基于条件重复执行

一期建议只支持两种模式：

- `for_each`
- `repeat_until`

必备保护：

- `maxIterations`
- `timeout`
- 迭代索引
- 当前迭代变量

### `end`

用途：

- 显式结束流程
- 汇总最终输出

## 5.2 可选补充节点

建议尽快补一个轻量数据节点：

### `set`

用途：

- 设置变量
- 模板拼接
- 整理前一节点输出

如果没有 `set`，很多 prompt 拼装和数据映射都会被迫塞进 `llm` 节点里，导致流程可读性变差。

## 6. 数据模型

当前 `plugins/workflow/src/types.ts` 已定义基础结构，但要支持暂停/恢复，需要扩展。

## 6.1 WorkflowDefinition

建议演进字段：

```ts
interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
}
```

## 6.2 WorkflowNode

建议新增更明确的配置语义：

```ts
interface WorkflowNode {
  id: string;
  type: 'start' | 'llm' | 'if' | 'loop' | 'set' | 'end' | string;
  title: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}
```

说明：

- `config` 最终不要长期停留在 `string -> string` 结构
- 否则 `if / loop / schema` 等复杂节点会越来越难表示

## 6.3 WorkflowRun

建议从当前结构演进为：

```ts
interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'queued' | 'running' | 'paused' | 'success' | 'error' | 'cancelled';
  startedAt: number;
  endedAt?: number;
  currentNodeId?: string;
  resumeFromNodeId?: string;
  checkpointVersion: number;
  variables: Record<string, unknown>;
  nodeRuns: Record<string, WorkflowNodeRun>;
  executionStack?: WorkflowExecutionFrame[];
}
```

新增重点：

- `paused`
- `currentNodeId`
- `resumeFromNodeId`
- `variables`
- `executionStack`

## 6.4 WorkflowNodeRun

建议扩展为：

```ts
interface WorkflowNodeRun {
  nodeId: string;
  title: string;
  type: string;
  status: 'pending' | 'running' | 'paused' | 'success' | 'error' | 'skipped' | 'cancelled';
  attempt: number;
  startedAt?: number;
  endedAt?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  logs: string[];
  checkpoint?: WorkflowNodeCheckpoint;
}
```

## 6.5 Checkpoint 模型

```ts
interface WorkflowNodeCheckpoint {
  savedAt: number;
  kind: 'node_boundary' | 'loop_iteration' | 'wait_state';
  data: Record<string, unknown>;
}
```

### 关键原则

- 一期只保证“节点边界恢复”
- 不承诺“正在执行中的 LLM 流中断后原位续跑”
- 对于执行中的节点，恢复语义是“从当前节点重新执行”

## 7. 运行时模型

## 7.1 Run 状态机

### Run 级别状态

- `queued`
- `running`
- `paused`
- `success`
- `error`
- `cancelled`

### Node 级别状态

- `pending`
- `running`
- `paused`
- `success`
- `error`
- `skipped`
- `cancelled`

## 7.2 Pause 语义

一期定义：

- Pause 在节点边界生效
- 如果当前节点未开始，直接暂停
- 如果当前节点正在执行，则标记 `pauseRequested`
- 当前节点结束后写 checkpoint，整个 run 进入 `paused`

不建议一期支持：

- LLM token 级别断点恢复
- shell 流中途暂停后继续从中间输出接着跑

## 7.3 Resume 语义

一期定义：

- 从最近一次 checkpoint 恢复
- 如果 pause 发生在节点边界，则从下一待执行节点继续
- 如果 pause/cancel 发生在节点运行中，则从该节点重新执行

## 7.4 Cancel 语义

- 当前 run 停止
- 正在执行的长任务尝试取消
- run 进入 `cancelled`
- 不可继续 resume

## 7.5 Retry 语义

建议支持两种 retry：

- `retry run`
- `retry node`

一期优先实现：

- 从失败节点重新执行
- 保留之前节点输出

## 8. 控制流语义

## 8.1 Start / End

- `start` 是单入口
- `end` 是显式结束

## 8.2 If

建议 edge 增加分支语义：

```ts
interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  branch?: 'true' | 'false' | 'default' | string;
}
```

### 规则

- `if` 至少有一个分支
- 可以有 `true/false`
- 如果条件无匹配但存在 `default`，走 default
- 否则 run error

## 8.3 Loop

建议不要把 loop 仅建模成普通线性节点，而应在 runtime 中有显式 frame：

```ts
interface WorkflowExecutionFrame {
  type: 'loop';
  nodeId: string;
  iteration: number;
  maxIterations: number;
  items?: unknown[];
  cursor?: number;
}
```

这样 pause / resume 才有明确恢复点。

## 9. 变量与模板系统

一期不要做复杂表达式引擎，但要有最基本的变量引用。

建议支持：

- `{{previous.output}}`
- `{{node.<id>.output}}`
- `{{vars.<key>}}`
- `{{loop.index}}`
- `{{loop.item}}`

变量来源：

- start input
- llm 输出
- set 节点写入
- loop 上下文

## 10. LLM 节点设计

LLM 节点是本系统的核心，必须严格定义。

## 10.1 输入

- prompt template
- optional system prompt
- optional model/provider override
- optional timeout
- optional structured output schema

## 10.2 输出模式

### text

适合：

- 文案生成
- 总结
- 重写

### json

适合：

- if 条件
- loop 控制
- 数据抽取
- 结构化任务结果

## 10.3 校验规则

- JSON 模式下必须是合法 JSON
- 配置 schema 时必须校验字段
- 校验失败应视为节点 error

## 10.4 与现有能力衔接

当前 `workflow.llm` 实际通过 `core.llm.complete` 执行，这个设计方向可以保留：

- Workflow 只关心编排
- 宿主负责真实 LLM 调用能力

建议新增：

- output mode
- schema validation
- result normalization

## 11. 持久化与恢复

当前 `storage.ts` 已支持 workflow / run / settings 的文件落盘，这是很好的基础。

建议新增持久化文件：

- `definitions.json`
- `runs.json`
- `active-run.json` 可选

如果需要更明确恢复点，可增加：

- `checkpoints/<runId>.json`

### 一期建议

先不拆太多文件，优先把 checkpoint 直接内嵌到 `run` 数据里。等 run 规模变大后再拆分。

## 12. 事件模型

为了和现有 Rhythm 的流式架构保持一致，Workflow 运行也应该是事件驱动的。

建议事件：

- `workflow.run.started`
- `workflow.node.started`
- `workflow.node.log`
- `workflow.node.completed`
- `workflow.run.paused`
- `workflow.run.resumed`
- `workflow.run.failed`
- `workflow.run.completed`

这样 Workbench Run View 可以天然对齐现有 session timeline 的设计思路。

## 13. UI 需求

## 13.1 Panel

展示：

- workflow 列表
- run 历史
- 最近失败/暂停的 run

## 13.2 Editor

一期尽量保持轻量：

- 节点增删改
- 基础连线
- inspector 编辑配置
- 快速运行

不需要一开始就做复杂画布交互。

## 13.3 Run View

必须重点建设，至少包含：

- 当前 run 状态
- 当前节点
- 各节点状态
- 日志
- 输入/输出
- pause / resume / cancel / retry 操作

Run View 的价值优先级高于 Editor 的炫酷程度。

## 14. 非功能要求

- 单工作流执行行为可预测
- 同一 run 的状态变化可追踪
- pause / resume 语义稳定
- LLM 输出校验失败可解释
- loop 不能无限跑飞
- 错误与取消都应可视化

## 15. 一期成功标准

如果满足以下条件，即可认为 Workflow Lite MVP 成立：

- 用户可以创建一个由 `start -> llm -> if -> llm/end` 组成的流程
- 流程可运行，且每个节点状态可见
- run 可以在节点边界暂停
- run 可以从 checkpoint 恢复
- 失败节点可以重试
- loop 节点支持有限次数迭代
- LLM 节点支持 JSON 输出并能驱动判断逻辑

## 16. 后续扩展方向

在 MVP 稳定后，再考虑：

- 子工作流
- 并行分支
- 更多内置数据节点
- trigger 节点
- 人工确认节点
- 外部服务集成节点
- workflow 与 agent session 更深融合

现阶段最重要的是把 Workflow 做成“一个稳定的小引擎”，而不是尽快把节点数量堆起来。
