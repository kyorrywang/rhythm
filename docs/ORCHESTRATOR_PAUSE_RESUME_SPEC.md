# Agent 编排引擎暂停与恢复规范

## 1. 文档目的

本文档定义 Rhythm `Agent 编排引擎` 在一期中的暂停、恢复与运行控制模型。

这份文档是后续开发、联调与验收的直接依据。

本文档只覆盖当前已经明确的一期范围：

- 主 Agent 唤醒模型
- Run 生命周期
- `Pause`
- `Resume`
- 基于 SQL 持久化的状态重建

本文档暂不展开 `interrupted` 的详细实现，只定义它的保留位置与边界。

## 2. 核心结论

### 2.1 主 Agent 的角色

主 Agent 不是一个必须长期常驻的会话实体。

主 Agent 的本质是：

`一个可被反复唤醒的流程调度器`

它的职责不是亲自完成所有工作，而是：

- 读取当前 Run 状态
- 判断下一步应该做什么
- 决定直接处理、启动子 Agent，还是调用 workflow
- 写入决策结果
- 结束当前调度轮次

### 2.2 Pause 的本质

`Pause` 的本质不是冻结整个系统，而是：

`停止主 Agent 的后续调度`

也就是说：

- 不再让主 Agent 发起新的执行请求
- 当前已经发起的子任务允许自然收尾
- 当活跃子任务全部结束后，Run 进入 `paused`

### 2.3 Resume 的本质

`Resume` 的本质不是续流，也不是恢复某段思维过程，而是：

`重新唤醒主 Agent`

恢复时，系统从 SQL 中重建当前 Run 的结构化状态，并向主 Agent 发出一条“继续执行”的系统控制消息。

## 3. 一期范围

### 3.1 一期必须支持

- 创建编排 Run
- 启动主 Agent 调度
- 查看 Run 当前状态
- 对 Run 执行 `Pause`
- 对 `paused` 的 Run 执行 `Resume`
- 基于 SQL 状态重建恢复主 Agent
- 会话入口和工作台入口对同一 Run 状态保持一致

### 3.2 一期暂不实现

- 真正的强制中断正在运行中的所有执行单元
- 从子 Agent 的中间思考态继续执行
- 对任意 tool 调用做原位恢复
- 完整的 `interrupted` 恢复策略

## 4. 关键定义

### 4.1 Run

`Run` 是一次编排任务运行。

它至少包含：

- 目标
- 模板
- 当前状态
- 当前阶段
- 最近调度结果
- 子任务列表
- 工件
- 事件流

### 4.2 调度轮次

主 Agent 每次被唤醒并完成一次“读取状态 -> 做决策 -> 发起动作 -> 写入结果”的过程，称为一次调度轮次。

一期实现中，系统不要求主 Agent 长驻运行，而是允许其以调度轮次为单位被多次唤醒。

### 4.3 活跃子任务

活跃子任务指已经由主 Agent 发起、但尚未结束的执行单元，例如：

- 子 Agent 任务
- workflow run
- 等待审批
- 其他异步执行单元

## 5. 运行模型

### 5.1 工作方式

编排引擎的运行方式定义为：

1. 用户在会话或工作台中发起一个 Run
2. 系统创建 Run 记录并持久化
3. 系统唤醒主 Agent
4. 主 Agent 读取当前 Run 状态
5. 主 Agent 决定下一步动作
6. 主 Agent 发起子任务或调用 workflow
7. 主 Agent 写入调度结果并结束本轮
8. 当子任务完成、用户恢复、用户修改目标等事件发生时，再次唤醒主 Agent

### 5.2 主 Agent 非常驻

一期明确采用：

`主 Agent 非常驻、按事件唤醒`

这意味着：

- 主 Agent 不依赖长时间常驻内存态
- 主 Agent 不依赖长上下文持续累积
- 主 Agent 的每轮工作都可由 SQL 状态重建

### 5.3 恢复依赖结构化状态

恢复主 Agent 时，必须依赖以下结构化材料，而不是依赖完整原始聊天上下文：

- Run 当前状态
- 当前阶段
- 已完成和活跃的子任务摘要
- 关键工件摘要
- 最近事件
- 当前控制意图

## 6. 状态模型

一期 Run 状态最少定义如下：

- `pending`
- `running`
- `pause_requested`
- `paused`
- `completed`
- `failed`
- `cancelled`
- `interrupted`

状态语义：

- `pending`
  Run 已创建但尚未开始调度

- `running`
  Run 正在正常推进，主 Agent 允许继续发起新动作

- `pause_requested`
  用户已请求暂停，但当前活跃子任务尚未全部结束

- `paused`
  Run 已暂停，主 Agent 不会继续被唤醒执行

- `completed`
  Run 已完成

- `failed`
  Run 失败结束

- `cancelled`
  Run 被取消

- `interrupted`
  预留给未来处理意外中断，不作为一期重点实现对象

## 7. Pause 语义

### 7.1 定义

`Pause` 是人为发起的真实暂停操作。

触发后，系统必须：

1. 将 Run 状态置为 `pause_requested`
2. 阻止主 Agent 发起新的调度动作
3. 允许当前已发起的活跃子任务自然完成
4. 当活跃子任务清零后，将 Run 状态置为 `paused`

### 7.2 关键原则

一期只实现一种暂停：

`Pause = 人为暂停，等待当前活跃任务自然收尾`

不区分软暂停与硬暂停。

### 7.3 触发入口

`Pause` 至少应可从两个入口触发：

- 会话入口
- 工作台入口

二者必须作用于同一个 Run。

### 7.4 UI 展示要求

当用户触发 Pause 后，系统必须清晰展示：

- 当前状态为 `pause_requested`
- 当前还有哪些活跃子任务
- Pause 尚未完全生效的原因

当活跃子任务全部结束后，系统必须展示：

- 当前状态为 `paused`

## 8. Resume 语义

### 8.1 定义

`Resume` 是对 `paused` Run 的继续执行操作。

触发后，系统必须：

1. 读取该 Run 的 SQL 持久化状态
2. 重建当前 Run 的结构化上下文
3. 向主 Agent 发送一条 Resume 控制消息
4. 主 Agent 基于当前状态继续做下一轮调度
5. 将 Run 状态重新置为 `running`

### 8.2 Resume 不是续流

一期明确约束：

- Resume 不是继续某个未完成的 token 流
- Resume 不是恢复子 Agent 的中间思考过程
- Resume 是重新唤醒主 Agent 并继续调度

### 8.3 Resume 前提

只有处于 `paused` 状态的 Run 才允许执行 `Resume`。

## 9. 主 Agent 唤醒模型

### 9.1 唤醒触发源

主 Agent 可由以下事件唤醒：

- Run 启动
- 用户执行 `Resume`
- 子 Agent 完成
- workflow 完成
- 审批结果返回
- 用户修改目标或补充约束

### 9.2 唤醒输入

主 Agent 每次被唤醒时，应接收到一份结构化运行摘要，而不是依赖完整历史对话。

建议至少包含：

- `runId`
- `templateId`
- `goal`
- `currentStage`
- `runStatus`
- `activeTasks`
- `completedTasksSummary`
- `artifactsSummary`
- `recentEvents`
- `controlIntent`

### 9.3 控制消息

主 Agent 的唤醒应建立在明确的系统控制消息之上。

一期建议至少支持以下消息类型：

```ts
type OrchestratorControlMessage =
  | { type: 'start'; runId: string }
  | { type: 'resume'; runId: string }
  | { type: 'child_completed'; runId: string; childId: string }
  | { type: 'workflow_completed'; runId: string; workflowRunId: string }
  | { type: 'approval_received'; runId: string; approvalId: string }
  | { type: 'user_updated_goal'; runId: string };
```

## 10. SQL 持久化要求

由于恢复完全依赖状态重建，SQL 至少需要持久化以下信息。

### 10.1 Run 基本状态

- `runId`
- `templateId`
- `goal`
- `status`
- `currentStageId`
- `createdAt`
- `updatedAt`
- `pausedAt`
- `pauseRequestedAt`

### 10.2 控制状态

- 当前是否存在 `pause` 意图
- 最近一次 `resume` 时间
- 当前是否允许继续调度

### 10.3 子任务关系

- 活跃子任务列表
- 已完成子任务列表
- 子任务类型
- 子任务状态
- 子任务与父 Run 的关联关系

### 10.4 workflow 关联

- 当前关联的 workflow run
- workflow run 状态
- workflow run 恢复位置

### 10.5 工件与摘要

- 重要工件索引
- 供恢复使用的摘要信息

### 10.6 事件流

- Run 创建
- 模板匹配
- 主 Agent 调度
- 子任务启动
- 子任务完成
- Pause 请求
- Pause 生效
- Resume 执行

## 11. 会话与工作台的一致性要求

一期必须满足：

- 会话里触发的 Pause，在工作台中立即可见
- 工作台里触发的 Resume，在会话里查询时立即反映
- 会话与工作台都通过同一套 Run 状态与命令生效

不得出现：

- 会话里显示已暂停，但工作台仍显示运行中
- 工作台里显示已恢复，但会话仍无法继续调度

## 12. 与子 Agent / workflow 的协作语义

### 12.1 子 Agent

一期对子 Agent 的要求是：

- 已发起的子 Agent 任务允许自然完成
- Run 进入 `pause_requested` 后，不再发起新的子 Agent 任务
- Resume 后由主 Agent 决定是否继续派发新子 Agent

### 12.2 workflow

workflow 作为主 Agent 的过程工具，应遵循：

- 已启动的 workflow run 允许自然推进到当前边界结束
- Run 进入 `pause_requested` 后，不再由主 Agent 发起新的 workflow run
- Resume 后可继续调用 workflow

### 12.3 一期不要求

一期不要求：

- 子 Agent 中间态暂停
- 子 Agent 原位恢复
- workflow 任意时刻中断恢复

## 13. 开发要求

以下要求直接约束一期实现。

### 13.1 必须实现

- Run 状态 `pause_requested` 与 `paused`
- 主 Agent 唤醒模型
- Resume 时的结构化状态重建
- 会话入口 Pause / Resume
- 工作台入口 Pause / Resume
- 活跃子任务统计

### 13.2 必须避免

- 将 Pause 实现为仅修改前端展示状态
- 将 Resume 实现为纯文本式“继续”且不带结构化状态
- 依赖完整历史聊天作为恢复唯一依据

## 14. 验收标准

满足以下条件后，才可认为一期暂停/恢复能力达标。

### 14.1 Pause 验收

场景：

1. 用户启动一个编排 Run
2. Run 已发起至少一个子任务
3. 用户执行 Pause

验收标准：

- Run 状态立即变为 `pause_requested`
- 主 Agent 不再发起新的子任务
- 已发起的子任务允许完成
- 所有活跃子任务完成后，Run 状态变为 `paused`

### 14.2 Resume 验收

场景：

1. 存在一个 `paused` 的 Run
2. 用户执行 Resume

验收标准：

- 系统从 SQL 重建当前 Run 状态
- 主 Agent 被重新唤醒
- 主 Agent 收到结构化状态摘要
- Run 状态重新变为 `running`
- 后续流程可继续推进

### 14.3 一致性验收

场景：

1. 在会话中 Pause 一个 Run
2. 在工作台中查看状态
3. 在工作台中 Resume
4. 回到会话中查询状态

验收标准：

- 两个入口看到的是同一状态
- 不存在状态不同步

### 14.4 恢复模型验收

场景：

1. 创建并运行一个 Run
2. Pause
3. Resume

验收标准：

- 不要求恢复 token 流
- 不要求恢复子 Agent 中间思维
- 只要求主 Agent 被重新唤醒并继续正确调度

## 15. 结论

一期的暂停与恢复方案正式定义为：

- 主 Agent 是可被反复唤醒的流程调度器
- Pause 的本质是停止主 Agent 的后续调度
- Resume 的本质是基于 SQL 状态重建后重新唤醒主 Agent
- 一期不追求中间态冻结，只追求边界清晰、状态可靠、恢复稳定

这套模型应作为 `Agent 编排引擎` 一期暂停/恢复能力的开发与验收标准。
