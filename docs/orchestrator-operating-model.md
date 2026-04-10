# 编排系统设计模型 v2

本文档定义 Rhythm 中长期编排系统的目标、边界、对象模型、状态机和重构方向。

这版模型不再把系统理解为“一个编排 Agent 模拟人不断和其他 Agent 交互”，而是把它定义为：

`一个受约束的编排决策系统，在已确认计划、任务图、审核门禁和人工闸门约束下，持续推动 run 向收敛状态前进。`

---

## 1. 设计目标

系统目标不是执行一个静态模板，也不是让一个超级 Agent 自由发挥。

系统目标是：

1. 用户与主 Agent 把目标、约束和成功标准定义清楚
2. 用户确认计划后授权系统接管推进
3. 编排系统在明确边界内持续决策、执行、审核、返工和升级
4. 系统在长期运行中保持可恢复、可审计、可暂停、可人工接管

编排系统解决的核心问题是：

- 谁在项目长期运行时持续推进下一步
- 哪些动作可以自动做
- 哪些节点必须审核
- 哪些节点必须停下来等人
- 如何让状态持续收敛，而不是越跑越乱

---

## 2. 核心原则

### 2.1 `plan` 是授权边界，不是建议

`plan` 一旦被用户确认，就成为 run 的高层边界。

编排系统可以在 `plan` 允许的范围内拆解、重排和推进，但不能擅自改变：

- 总目标
- 主要阶段含义
- 审核原则
- 人工确认边界

### 2.2 编排 Agent 是受限决策器，不是自由导演

编排 Agent 的价值不是“会说话”，而是：

- 在当前约束下判断最值得推进的下一步
- 生成高质量任务说明
- 动态拆解和重排任务图
- 判断何时进入审核
- 判断何时请求人工介入

但它不负责决定什么状态转移是合法的。合法性由状态机和门禁规则定义。

### 2.3 `task graph` 是执行真相

系统当前能做什么、不能做什么、在等什么，不应依赖聊天上下文，而应依赖 `task graph`。

`task graph` 是 run 的执行真相。

### 2.4 审核和人工确认是硬门禁

如果某阶段要求审核，则必须经过审核 Agent 或人工 override。

如果某节点要求人工确认，则 run 必须进入等待人工状态，不能由编排 Agent 自行继续。

### 2.5 已审核通过的项目状态才是后续输入

未通过审核的结果只是草稿，不是稳定事实。

只有 `accepted artifact` 才能进入 `project state`，成为后续任务默认依赖。

### 2.6 长时系统必须可恢复且可审计

系统必须能够回答：

- 当前 run 为什么处于这个状态
- 上一步为什么派发了这个任务
- 审核为什么通过或不通过
- 当前为什么暂停
- 下一步为什么需要人工介入

---

## 3. 角色定义

### 3.1 主 Agent

主 Agent 位于用户对话层，职责是：

- 理解目标
- 澄清需求
- 生成 `plan draft`
- 帮助用户确认计划
- 创建 run

主 Agent 不负责长期推进 run。

### 3.2 编排 Agent

编排 Agent 位于 run 内部，是受限决策器。

职责：

- 读取 run 状态快照
- 读取 `plan / task graph / review policy / review log / project state`
- 在允许的状态转移内做决策
- 决定下一步执行、审核、拆解、返工或升级
- 生成 assignment brief

不负责：

- 直接产出业务结果
- 擅自修改已确认计划的语义
- 绕过 review 或 human checkpoint

### 3.3 Work Agent

Work Agent 只负责局部执行。

职责：

- 完成局部任务
- 产出 `draft artifact`
- 回写结果、风险和局部说明

不负责：

- 推进全局流程
- 宣布进入下一阶段
- 直接修改 `project state`

### 3.4 Review Agent

Review Agent 是质量门禁。

职责：

- 审核明确的提交物
- 输出结构化审核结论
- 给出不通过原因和返工要求

不负责：

- 重写业务结果
- 推进流程

### 3.5 用户

用户负责最终授权和控制权收回。

职责：

- 确认计划
- 处理人工确认节点
- 处理审核 override
- 修改范围、目标、优先级
- 在系统无法收敛时接管

---

## 4. 核心对象模型

### 4.1 `plan`

`plan` 是 run 的高层边界。

至少应包含：

- `goal`
- `context`
- `constraints`
- `successCriteria`
- `phaseDefinitions`
- `decompositionRules`
- `reviewRules`
- `humanCheckpointRules`
- `outOfScope`

关键规则：

- `plan` 必须由主 Agent 生成
- `plan` 必须经过用户确认
- confirmed 后只能通过显式 revision 变更

### 4.2 `run`

`run` 是一个长期执行对象。

至少应包含：

- `id`
- `planId`
- `planRevision`
- `status`
- `executionContext`
- `currentPhase`
- `activeCoordinatorRunId`
- `pendingHumanAction`
- `failureState`
- `metrics`

`executionContext` 是 run 的一等配置，而不是前台 UI 状态的借用。

### 4.3 `task graph`

`task graph` 是执行真相。

每个 task 节点至少应包含：

- `id`
- `parentTaskId`
- `kind`
- `status`
- `objective`
- `inputs`
- `expectedOutputs`
- `dependencies`
- `priority`
- `retryPolicy`
- `assignedAgentType`
- `attempts`
- `latestArtifactIds`
- `latestReviewLogId`
- `blockedReason`

`kind` 建议包含：

- `container`
- `work`
- `review`
- `checkpoint`

### 4.4 `artifact`

`artifact` 是执行过程中的结果对象。

状态建议区分：

- `draft`
- `review_submitted`
- `accepted`
- `superseded`
- `rejected`

其中：

- `draft` 不能进入项目稳定状态
- `accepted` 才能被后续默认依赖

### 4.5 `project state`

`project state` 描述当前项目已经沉淀下来的稳定事实。

它不记录聊天历史，只记录已确认结果，例如：

- 已通过审核的文档
- 已接受的设计结论
- 已稳定的目录结构
- 已验收的模块边界

### 4.6 `review policy`

`review policy` 定义：

- 哪些节点必须审核
- 审核标准
- 不通过时的处理方式
- 是否允许人工 override

### 4.7 `review log`

`review log` 记录：

- 审核对象
- 审核时间
- 审核结论
- 不通过原因
- 返工意见
- 是否人工覆盖

### 4.8 `failure state`

长期运行中，失败不是异常，而是一等状态。

`failure state` 至少应表达：

- 为什么当前不能继续
- 这是 task 级问题还是 run 级问题
- 是否允许自动重试
- 是否必须人工介入
- 系统建议的下一步

---

## 5. 状态机模型

### 5.1 Run 状态

建议的 run 状态：

- `pending`
- `running`
- `waiting_review`
- `waiting_human`
- `paused`
- `failed`
- `completed`
- `cancelled`

关键语义：

- `waiting_review` 表示系统必须先完成审核，不能继续派发同阶段 work
- `waiting_human` 表示系统必须停下等待人工动作
- `paused` 表示人为或系统主动暂停
- `failed` 表示当前 run 无法继续自动收敛

### 5.2 Task 状态

建议的 task 状态：

- `pending`
- `ready`
- `running`
- `waiting_review`
- `waiting_human`
- `blocked`
- `completed`
- `failed`
- `cancelled`

### 5.3 合法主流程

典型主流程如下：

1. 用户确认 `plan`
2. 系统创建 `run`
3. run 进入 `running`
4. 编排 Agent 为当前阶段创建 `work task`
5. Work Agent 产出 `draft artifact`
6. 对应 task 进入 `waiting_review`
7. Review Agent 审核提交物
8. 审核通过：
   - artifact 标记为 `accepted`
   - task 标记为 `completed`
   - `project state` 更新
   - run 回到 `running`
9. 审核不通过：
   - 生成 rework task 或标记 blocked
   - run 进入 `paused` 或 `waiting_human`
10. 全部阶段完成：
   - run 进入 `completed`

### 5.4 强约束

系统必须满足以下约束：

- `waiting_review` 时不能继续推进同阶段 work
- `waiting_human` 时不能自动恢复
- `accepted artifact` 之前不能写入 `project state`
- 编排 Agent 只能产生合法状态转移

---

## 6. 编排 Agent 的职责边界

### 6.1 编排 Agent 该做什么

每次被唤醒时，编排 Agent 应做以下工作：

1. 读取 run 状态快照
2. 读取 `plan`
3. 读取 `task graph`
4. 读取 `review policy`
5. 读取 `review log`
6. 读取 `project state`
7. 判断当前是否允许自动推进
8. 在合法动作集合中选出下一步
9. 输出结构化决策

### 6.2 编排 Agent 不该做什么

编排 Agent 不应：

- 直接产出业务内容
- 直接跳过审核
- 在等待人工时自动续跑
- 擅自修改已确认计划的目标语义
- 依赖无限增长的聊天历史作为唯一事实来源

### 6.3 编排 Agent 的真正价值

编排 Agent 的价值不是“点下一步”，而是：

- 在多个合法动作中选最合适的下一步
- 将高层目标翻译成高质量 assignment brief
- 动态拆解、合并、重排 task
- 判断何时 review、何时返工、何时升级人工
- 选择恢复策略和收敛路径

---

## 7. Assignment Brief 设计

编排 Agent 派发执行时，不应只传一句自然语言。

每次 dispatch 应生成结构化 assignment brief，至少包含：

- `goal`
- `whyNow`
- `context`
- `inputs`
- `instructions`
- `deliverables`
- `targetFolder`
- `expectedFiles`
- `reviewFocus`
- `risks`

这样系统的智能价值不在于“替用户说一句话”，而在于将高层计划和当前状态转为可执行的局部任务说明。

---

## 8. Review 设计

### 8.1 Review 的对象

Review Agent 审核的是“当前提交物”，不是整个世界。

审核输入应限定为：

- 被审核 task id
- 被审核 artifact ids
- 明确的 review target paths
- 对应阶段的 acceptance criteria
- 相关的 accepted project state

### 8.2 Review 的输出

Review 输出必须结构化，至少包含：

- `decision`
- `summary`
- `issues`
- `requiredRework`
- `confidence`

其中 `decision` 建议限定为：

- `approved`
- `needs_changes`
- `rejected`

### 8.3 Review 的门禁语义

- `approved`：允许继续，并把提交物转为 `accepted`
- `needs_changes`：生成返工或进入阻塞态
- `rejected`：停止自动推进，并升级人工介入或失败状态

Review 不是装饰，而是硬门禁。

---

## 9. 人工确认设计

系统必须显式建模人工闸门，而不是靠 prompt 提醒。

人工确认节点的典型场景：

- 计划确认
- 关键方向变更
- 审核冲突
- 多轮返工不收敛
- 环境问题无法自动解决

命中人工确认节点时，run 必须进入：

- `waiting_human`

只有人工操作后，系统才能继续。

---

## 10. 失败与升级模型

长期系统中的失败类型建议至少包括：

- `environment_unavailable`
- `insufficient_context`
- `review_deadlock`
- `non_converging_rework`
- `policy_conflict`
- `agent_runtime_error`
- `human_required`

每个失败都应记录：

- `failureKind`
- `failureSummary`
- `firstOccurredAt`
- `lastOccurredAt`
- `retryCount`
- `recommendedAction`

这样 run 不只是“停住了”，而是“为什么停、建议谁下一步做什么”。

---

## 11. 恢复与 watchdog 模型

恢复逻辑必须是状态机的一部分，而不是任意重拉。

### 11.1 恢复原则

恢复时应执行：

1. 读取 persisted run snapshot
2. 做 schema migration
3. 校验状态一致性
4. 检查是否存在有效 lease
5. 恢复 coordinator 或 active agent
6. 恢复失败时再进入 watchdog 逻辑

### 11.2 Watchdog 原则

Watchdog 的职责不是“看到没动静就瞎暂停”，而是：

- 检查是否真的超时
- 判断超时属于 agent 卡死、环境失败还是状态不一致
- 写入结构化 failure state
- 决定暂停、失败或人工升级

### 11.3 并发控制

同一个 run 的维护逻辑必须串行化。

对同一 run，不允许多个恢复循环、watchdog 循环和调度循环重叠执行。

---

## 12. 执行上下文模型

`executionContext` 是 run 的一等对象。

至少应包含：

- `providerId`
- `model`
- `reasoning`
- `workspacePath`
- `toolPolicy`
- `capturedAt`

规则：

- run 创建时冻结
- 恢复和重试时默认沿用
- 只能显式更新，不能隐式借用前台 UI 的当前状态

---

## 13. 编排决策记录

编排 Agent 的每次决策必须可回看。

决策记录至少应包含：

- 输入快照摘要
- 候选动作
- 选择结果
- 命中的规则和约束
- 风险说明
- 是否需要人工

编排系统必须支持回答：

- 为什么现在派这个任务
- 为什么现在进入审核
- 为什么现在暂停
- 为什么请求人工介入

---

## 14. 模板的定位

模板不是执行真相。

模板的定位应是：

- `plan scaffold`
- 常见项目类型的起始骨架
- 帮助主 Agent 更快生成可确认的 `plan`

run 真正执行的依据永远是：

- confirmed `plan`
- `task graph`
- `review policy`
- `project state`

因此系统中心应从“模板中心”转向“run 文档中心”。

---

## 15. 一次完整执行循环

每次编排系统 wake 时，建议按以下顺序运行：

1. 读取 run snapshot
2. 校验 run 是否允许自动推进
3. 读取 `task graph`
4. 读取 accepted `project state`
5. 读取 pending review 和 human checkpoint
6. 调用编排 Agent 做受限决策
7. 验证决策是否合法
8. 写入 decision record
9. 更新 `task graph`
10. 派发 work / review / checkpoint
11. 等待结果回写
12. 重复直到 `completed / waiting_human / failed / cancelled`

---

## 16. 总结

这套系统的核心不是“多 Agent”，也不是“模拟人与 Agent 对话”。

它的核心是：

`用一个受约束的编排决策器，在明确状态机、硬门禁、稳定项目状态和人工控制边界之上，持续做高质量推进选择。`

其中：

- 主 Agent 负责把事情定义清楚
- 编排 Agent 负责在合法空间内做推进决策
- Work Agent 负责产出局部结果
- Review Agent 负责质量门禁
- 用户负责最终授权和人工控制节点

系统的成功标准不是“看起来像人在聊天”，而是：

- 能长期运行
- 能稳定收敛
- 能恢复
- 能审计
- 能在关键节点把控制权交还给人
