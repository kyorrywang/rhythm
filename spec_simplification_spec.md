# Rhythm — Spec 模块简化开发任务书

> **文档版本**：v1.0  
> **适用人员**：外包前端/全栈开发者  
> **技术栈**：TypeScript / React / Rust (Tauri)  
> **预计工作量**：5~8 人天

---

## 1. 背景与目标

### 1.1 项目背景

Rhythm 是一个桌面端 AI 编程助手（基于 Tauri + React）。它有三个核心工作模式：

| 模式 | 说明 | 状态 |
|------|------|------|
| `chat` | 普通对话 Agent | ✅ 完整可用 |
| `coordinate` | 多 Agent 并行编排（swarm） | ✅ 完整可用 |
| `spec` | 文档驱动的单任务执行 | ⚠️ 设计过度，执行循环缺失 |

### 1.2 本次任务目标

将 `spec` 模块从当前过度复杂的实现**简化重写**，使其：

1. **拥有完整可工作的执行循环**（当前核心循环完全缺失）
2. **像 OpenSpec 那样轻量**：文档驱动、checkbox 追踪进度、单 Agent 执行
3. **保留现有的 UI 脚手架和文件 API**，不做大规模 UI 重写

### 1.3 设计哲学（必读）

参考 OpenSpec（https://github.com/Fission-AI/OpenSpec）的核心理念：

- **文档即状态**：`tasks.md` 的 checkbox 是进度的唯一来源，不是 JSON 状态机
- **单 Agent 执行**：一个 Spec Agent 读 `change.md` + `tasks.md`，执行任务，更新 checkbox
- **简单状态机**：只有 `draft → active → done` 三个状态
- **人工介入用注释**：Agent 在 tasks.md 里写 `> ⚠️ 需要确认：xxx`，不用复杂的 `waiting_human` 状态

---

## 2. 当前代码结构（需要了解的现状）

```
src/domains/spec/
├── application/
│   ├── editor.ts          ← 保留核心逻辑，清理不需要的 reduce 函数
│   ├── execution.ts       ← 🗑️ 删除
│   ├── orchestration.ts   ← 🗑️ 删除
│   ├── planning.ts        ← 🗑️ 删除
│   ├── recovery.ts        ← 🗑️ 删除
│   └── review.ts          ← 🗑️ 删除
├── domain/
│   ├── contracts.ts       ← 🔄 大幅简化
│   ├── stateMachine.ts    ← 🔄 重写为 3 状态
│   ├── types.ts           ← 🔄 大幅简化
│   ├── validation.ts      ← 🗑️ 删除
│   ├── derived.ts         ← 保留（metrics 计算）
│   └── naming.ts          ← 保留
├── infra/
│   ├── agents.ts          ← 🔄 重写：4 profiles → 1 profile
│   ├── agentSessionRuntime.ts ← 🗑️ 删除
│   ├── changeFs.ts        ← 🔄 简化：去掉 node:path 依赖
│   ├── markdown.ts        ← 🔄 简化：去掉复杂渲染逻辑
│   ├── serializer.ts      ← 保留
│   ├── stateSync.ts       ← 🗑️ 删除（用了 node:fs，在 Tauri 里无效）
│   ├── storage.ts         ← 🗑️ 删除（Node.js 环境专用）
│   ├── timeline.ts        ← 暂时保留但简化
│   └── utils.ts           ← 保留
├── integration/
│   ├── actions.ts         ← 🔄 大幅简化
│   ├── chatFlow.ts        ← 🔄 简化：只处理 create_spec
│   ├── commands.ts        ← 🔄 大幅简化
│   ├── mode.ts            ← 🔄 简化
│   ├── navigation.ts      ← 保留
│   └── workbench.ts       ← 🔄 简化：去掉复杂的 transition 函数
├── ui/
│   ├── SpecChangesPanel.tsx  ← ✅ 保留（基本不动）
│   ├── SpecWorkbench.tsx     ← 🔄 重写执行相关逻辑
│   ├── SpecStatusHeader.tsx  ← 🔄 简化状态显示
│   └── helpers.ts            ← 🔄 更新 badge/status 映射
└── index.ts               ← 保留

src-tauri/src/tools/
└── spec_tools.rs          ← 🔄 简化（保留 create_spec，去掉复杂字段）
```

---

## 3. 新设计规范

### 3.1 文件存储结构

每个 spec change 存储在工作区的 `.spec/changes/{slug}/` 目录下：

```
.spec/changes/{slug}/
├── change.md      ← 人写：目标、范围、约束（唯一的"意图文档"）
├── tasks.md       ← Agent 生成 + 更新：checkbox 列表（进度的唯一来源）
├── artifacts/     ← Agent 产出物（代码、文档等）
└── state.json     ← 最小元数据（见下方定义）
```

**注意**：去掉 `plan.md`、`timeline.jsonl`、`agent-sessions.json`，这些在简化版本中不需要。

### 3.2 新的 `state.json` 结构

```typescript
interface SpecState {
  // 不可变元数据
  slug: string;           // URL-safe 唯一标识，如 "add-login-rate-limit"
  mode: 'spec';
  createdAt: number;      // Unix timestamp ms
  updatedAt: number;      // Unix timestamp ms

  // 变更信息（从 change.md 提取的结构化缓存，用于 UI 列表展示）
  title: string;
  goal: string;
  overview: string;       // 简短描述，可为空

  // 状态机（三个状态）
  status: 'draft' | 'active' | 'done';

  // 进度快照（从 tasks.md 实时解析，写入 state.json 用于列表展示）
  progress: {
    total: number;    // tasks.md 里 checkbox 总数
    done: number;     // 已勾选数量
  };
}
```

**关键原则**：`state.json` 是**展示用缓存**，不是真正的 source of truth。进度以 `tasks.md` 的 checkbox 为准。

### 3.3 新的状态机

```
draft  ──► active  ──► done
  │           │
  │     (agent 执行中)
  │
  └──► archived（可选，不影响执行逻辑）
```

| 状态 | 含义 | 允许的操作 |
|------|------|------------|
| `draft` | 人在定义问题，change.md 可编辑 | 编辑文档、触发 Run |
| `active` | Agent 正在执行 tasks | 查看进度、中断 |
| `done` | 所有 tasks 完成 | 归档、查看 |

**没有** `planned / ready / running / waiting_review / waiting_human / paused / failed` 这些状态。

### 3.4 change.md 格式

Agent 和人都按此格式写 `change.md`：

```markdown
# {标题}

## 目标
一句话描述要解决的问题。

## 概述（可选）
更详细的背景信息。

## 范围
- 包含：xxx
- 不包含：xxx

## 约束
- 约束条件 1
- 约束条件 2

## 成功标准
- [ ] 标准 1
- [ ] 标准 2
```

### 3.5 tasks.md 格式

```markdown
# Tasks: {标题}

## 阶段一：分析与规划
- [ ] 1.1 阅读相关代码，了解现有实现
- [ ] 1.2 确定修改范围

## 阶段二：实现
- [ ] 2.1 完成核心功能 X
- [ ] 2.2 添加测试

## 阶段三：验证
- [ ] 3.1 运行测试，确认通过
- [ ] 3.2 更新文档

> ⚠️ 需要人工确认：请检查 src/xxx.ts 的改动是否符合预期
```

**checkbox 规则**：
- `- [ ]` = 未完成
- `- [x]` = 已完成
- `> ⚠️ 需要人工确认：...` = Agent 遇到需要人介入的情况（UI 显示警告图标）

### 3.6 执行循环设计

```
用户点击 "Run"
    ↓
前端调用 chat_stream（Tauri 命令）
    profile_id = "spec"
    prompt = buildSpecAgentPrompt(change.md, tasks.md 内容)
    cwd = 工作区路径
    ↓
Spec Agent 在 Rust 端执行（QueryEngine）
    读 change.md 和 tasks.md
    逐个执行 task
    对每个 task，更新 tasks.md 中的对应 checkbox（- [ ] → - [x]）
    如需复杂子任务，调用 spawn_subagent 工具（已有）
    如需人工确认，在 tasks.md 插入 "> ⚠️ 需要人工确认：..."
    所有 task 完成后，停止
    ↓
前端监听 stream 事件
    检测到 status=completed → 重新加载 tasks.md → 更新 state.json → 状态变为 done
    检测到 status=failed/interrupted → 状态保持 active，显示错误信息
```

**关键点**：前端在 stream `completed` 事件后，重新读取 tasks.md 解析 checkbox，更新 `state.json` 的 `progress` 字段和 `status`（如果全部 done，则变为 `done`）。

---

## 4. 需要删除的文件

以下文件**直接删除**，不需要迁移逻辑：

```
src/domains/spec/application/execution.ts
src/domains/spec/application/orchestration.ts
src/domains/spec/application/planning.ts
src/domains/spec/application/recovery.ts
src/domains/spec/application/review.ts
src/domains/spec/domain/contracts.ts      ← 删除（整个 agent 协议 JSON 不再需要）
src/domains/spec/domain/validation.ts    ← 删除（验证复杂 JSON payload 的代码）
src/domains/spec/infra/agentSessionRuntime.ts
src/domains/spec/infra/stateSync.ts      ← 用了 node:fs，在 Tauri 中无效
src/domains/spec/infra/storage.ts        ← Node.js 环境专用，与 Tauri FS API 重复
```

---

## 5. 需要重写的文件

### 5.1 `src/domains/spec/domain/types.ts`（重写）

替换为以下简化类型定义：

```typescript
export type SpecStatus = 'draft' | 'active' | 'done';

export interface SpecState {
  slug: string;
  mode: 'spec';
  createdAt: number;
  updatedAt: number;
  title: string;
  goal: string;
  overview: string;
  status: SpecStatus;
  progress: {
    total: number;
    done: number;
  };
}

export interface SpecDocuments {
  change: string;   // change.md 的完整文本内容
  tasks: string;    // tasks.md 的完整文本内容
}
```

### 5.2 `src/domains/spec/domain/stateMachine.ts`（重写）

```typescript
import type { SpecStatus } from './types';

export const SPEC_STATUS_TRANSITIONS: Record<SpecStatus, SpecStatus[]> = {
  draft:  ['active'],
  active: ['done', 'draft'],   // draft = 中断后退回
  done:   [],
};

export function canTransition(from: SpecStatus, to: SpecStatus): boolean {
  return SPEC_STATUS_TRANSITIONS[from].includes(to);
}

/** 从 tasks.md 内容解析 checkbox 进度 */
export function parseTaskProgress(tasksMd: string): { total: number; done: number } {
  const all = (tasksMd.match(/- \[[ x]\]/gi) || []);
  const done = (tasksMd.match(/- \[x\]/gi) || []);
  return { total: all.length, done: done.length };
}

/** tasks.md 中是否含有需要人工确认的标记 */
export function hasHumanCheckpoint(tasksMd: string): boolean {
  return /^>\s*⚠️/m.test(tasksMd);
}
```

### 5.3 `src/domains/spec/infra/agents.ts`（重写）

删除 4 个 profile，只保留 1 个 `spec-agent`：

```typescript
export const SPEC_MODE_ID = 'spec';
export const SPEC_AGENT_PROFILE_ID = 'spec-agent';

/**
 * 构建发送给 Spec Agent 的 prompt。
 * Agent 会读取这两个文档，逐个执行 tasks.md 里的 task，
 * 完成每个 task 后把对应 checkbox 改为 [x]。
 */
export function buildSpecAgentPrompt(changeMd: string, tasksMd: string): string {
  return `你是一个 AI 编程助手，正在执行一个 Spec 变更任务。

## 变更定义
${changeMd}

## 当前任务列表
${tasksMd}

## 执行规则
1. 按顺序逐个执行 tasks.md 里未完成（- [ ]）的任务
2. 每完成一个任务，立即把 tasks.md 中对应的 - [ ] 改为 - [x]（使用 edit_file 工具）
3. 如果遇到需要人工确认的情况，在 tasks.md 的相关任务下方插入一行：
   > ⚠️ 需要人工确认：{具体说明}
   然后停止执行，等待人工介入。
4. 所有任务完成后，停止并输出简短总结。
5. 产出的文件放在 .spec/changes/{slug}/artifacts/ 目录下。

现在开始执行。`;
}
```

### 5.4 `src/domains/spec/infra/changeFs.ts`（简化）

去掉 `node:path` 依赖（在 Tauri 渲染进程中不可用），改为纯字符串操作：

```typescript
// 不要 import path from 'node:path'

export const SPEC_ROOT = '.spec';
export const SPEC_CHANGES_DIR = '.spec/changes';

export function makeSpecChangeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'change';
}

export function getSpecRelativePaths(slug: string) {
  const base = `${SPEC_CHANGES_DIR}/${slug}`;
  return {
    changeDir: base,
    change:    `${base}/change.md`,
    tasks:     `${base}/tasks.md`,
    state:     `${base}/state.json`,
    artifacts: `${base}/artifacts`,
  };
}
```

### 5.5 `src/domains/spec/infra/markdown.ts`（简化）

只保留两个渲染函数：

```typescript
import type { SpecState } from '../domain/types';

/** 根据 SpecState 渲染初始的 change.md 模板 */
export function renderInitialChangeMd(state: SpecState): string {
  return `# ${state.title}\n\n## 目标\n${state.goal}\n\n## 概述\n${state.overview || ''}\n\n## 范围\n- 包含：\n- 不包含：\n\n## 约束\n\n## 成功标准\n- [ ] \n`;
}

/** 渲染初始的 tasks.md 模板（Agent 会填充具体任务） */
export function renderInitialTasksMd(state: SpecState): string {
  return `# Tasks: ${state.title}\n\n<!-- Agent 将在此填充具体任务列表 -->\n- [ ] 分析需求，制定任务计划\n`;
}
```

### 5.6 `src/domains/spec/application/editor.ts`（大幅简化）

保留以下函数，删除其余：

```typescript
import { makeSpecChangeSlug } from '../infra/changeFs';
import { renderInitialChangeMd, renderInitialTasksMd } from '../infra/markdown';
import { parseTaskProgress } from '../domain/stateMachine';
import type { SpecState, SpecDocuments } from '../domain/types';

export interface CreateSpecDraftInput {
  title: string;
  goal: string;
  overview?: string;
}

/** 创建初始 SpecState */
export function createSpecDraftState(input: CreateSpecDraftInput): SpecState {
  const now = Date.now();
  const slug = makeSpecChangeSlug(input.title);
  return {
    slug,
    mode: 'spec',
    createdAt: now,
    updatedAt: now,
    title: input.title,
    goal: input.goal,
    overview: input.overview ?? '',
    status: 'draft',
    progress: { total: 0, done: 0 },
  };
}

/** 将 state 转为初始文档 */
export function renderInitialDocuments(state: SpecState): SpecDocuments {
  return {
    change: renderInitialChangeMd(state),
    tasks:  renderInitialTasksMd(state),
  };
}

/**
 * 将 tasks.md 的当前内容同步到 state.progress。
 * 在 Agent 执行完、或用户手动编辑后调用。
 */
export function syncProgressFromTasks(state: SpecState, tasksMd: string): SpecState {
  const progress = parseTaskProgress(tasksMd);
  const isDone = progress.total > 0 && progress.done === progress.total;
  return {
    ...state,
    updatedAt: Date.now(),
    progress,
    status: isDone && state.status === 'active' ? 'done' : state.status,
  };
}

/** 触发 Run：将状态从 draft 变为 active */
export function startSpecRun(state: SpecState): SpecState {
  if (state.status !== 'draft') throw new Error(`Cannot start run from status: ${state.status}`);
  return { ...state, status: 'active', updatedAt: Date.now() };
}

/** 中断：将状态从 active 退回 draft */
export function interruptSpecRun(state: SpecState): SpecState {
  return { ...state, status: 'draft', updatedAt: Date.now() };
}
```

### 5.7 `src/domains/spec/integration/workbench.ts`（重写）

```typescript
import { readWorkspaceTextFile, writeWorkspaceTextFile } from '@/core/runtime/api/commands';
import { createSpecDraftState, renderInitialDocuments, syncProgressFromTasks, startSpecRun } from '../application/editor';
import { getSpecRelativePaths } from '../infra/changeFs';
import type { SpecState, SpecDocuments } from '../domain/types';
import type { CreateSpecDraftInput } from '../application/editor';

// ─── Load ─────────────────────────────────────────────────────────────────────

export interface SpecWorkbenchData {
  state: SpecState;
  documents: SpecDocuments;
}

export async function loadSpecWorkbench(workspacePath: string, slug: string): Promise<SpecWorkbenchData> {
  const paths = getSpecRelativePaths(slug);
  const [stateFile, changeFile, tasksFile] = await Promise.all([
    readWorkspaceTextFile(workspacePath, paths.state),
    readWorkspaceTextFile(workspacePath, paths.change),
    readWorkspaceTextFile(workspacePath, paths.tasks),
  ]);

  if (!stateFile.content) throw new Error(`Spec not found: ${slug}`);

  const state = JSON.parse(stateFile.content) as SpecState;
  return {
    state,
    documents: {
      change: changeFile.content || '',
      tasks:  tasksFile.content || '',
    },
  };
}

// ─── Persist ──────────────────────────────────────────────────────────────────

export async function persistSpecWorkbench(
  workspacePath: string,
  state: SpecState,
  documents: SpecDocuments,
) {
  const paths = getSpecRelativePaths(state.slug);
  await Promise.all([
    writeWorkspaceTextFile(workspacePath, paths.state, JSON.stringify(state, null, 2)),
    writeWorkspaceTextFile(workspacePath, paths.change, documents.change),
    writeWorkspaceTextFile(workspacePath, paths.tasks,  documents.tasks),
  ]);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createSpecInWorkspace(
  workspacePath: string,
  input: CreateSpecDraftInput,
): Promise<SpecState> {
  const state = createSpecDraftState(input);
  const documents = renderInitialDocuments(state);
  await persistSpecWorkbench(workspacePath, state, documents);
  return state;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

/**
 * 将状态转为 active 并持久化，返回发给 chat_stream 的 prompt。
 * 调用者负责实际发起 chat_stream。
 */
export async function prepareSpecRun(
  workspacePath: string,
  state: SpecState,
  documents: SpecDocuments,
): Promise<{ nextState: SpecState; prompt: string }> {
  const nextState = startSpecRun(state);
  await persistSpecWorkbench(workspacePath, nextState, documents);
  
  // prompt 构建交给 agents.ts
  const { buildSpecAgentPrompt } = await import('../infra/agents');
  const prompt = buildSpecAgentPrompt(documents.change, documents.tasks);
  return { nextState, prompt };
}

// ─── After run ────────────────────────────────────────────────────────────────

/**
 * Agent 执行完毕后调用。重新读取 tasks.md，同步进度到 state.json。
 */
export async function finalizeSpecRun(
  workspacePath: string,
  state: SpecState,
): Promise<SpecState> {
  const paths = getSpecRelativePaths(state.slug);
  const tasksFile = await readWorkspaceTextFile(workspacePath, paths.tasks);
  const tasksMd = tasksFile.content || '';
  const nextState = syncProgressFromTasks(state, tasksMd);
  // 只更新 state.json，documents 不变（Agent 已经直接改过了）
  await writeWorkspaceTextFile(workspacePath, paths.state, JSON.stringify(nextState, null, 2));
  return nextState;
}
```

### 5.8 `src/domains/spec/integration/chatFlow.ts`（简化）

只处理 `create_spec` 工具，去掉 `update_spec` 和 `start_spec`：

```typescript
import { createSpecInWorkspace } from './workbench';

export interface SpecToolPayload {
  kind: 'spec_tool_result';
  action: 'create_spec';
  title: string;
  goal: string;
  overview?: string;
}

/**
 * 当 LLM 调用 create_spec 工具时，由 useLLMStream 调用此函数。
 */
export async function applySpecToolResult(
  workspacePath: string,
  payload: SpecToolPayload,
): Promise<string> {
  if (payload.action !== 'create_spec') return '';
  
  const state = await createSpecInWorkspace(workspacePath, {
    title: payload.title,
    goal: payload.goal,
    overview: payload.overview,
  });

  return `spec://${state.slug}`;
}
```

### 5.9 `src/domains/spec/integration/actions.ts`（简化）

只保留必要的动作类型：

```typescript
export type SpecIntegrationAction =
  | { type: 'spec.create'; title: string; goal: string; overview?: string }
  | { type: 'spec.run';    slug: string }
  | { type: 'spec.interrupt'; slug: string };
```

---

## 6. UI 层变更

### 6.1 `SpecWorkbench.tsx` 执行逻辑重写

**当前问题**：`startSpecRunInWorkspace()` 被调用后什么都不会发生（执行循环缺失）。

**修改方案**：在 `handleRun` 中，实际调用 `chatStream` Tauri 命令：

```typescript
// SpecWorkbench.tsx 中的 handleRun 函数修改如下

import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';

async function handleRun() {
  setIsRunning(true);
  
  // 1. 持久化状态变为 active，获取 prompt
  const { nextState, prompt } = await prepareSpecRun(workspace.path, state, documents);
  setState(nextState);

  // 2. 创建事件通道，用于接收 Agent 的流式输出
  const channel = new Channel();
  const specSessionId = `spec-${state.slug}-${Date.now()}`;
  
  // 3. 监听 Agent 完成事件
  channel.onmessage = (event) => {
    if (event.payload?.state === 'completed' || event.payload?.state === 'failed') {
      // Agent 执行完毕，重新读取 tasks.md，同步进度
      finalizeSpecRun(workspace.path, nextState).then((finalState) => {
        setState(finalState);
        // 重新加载 documents（tasks.md 已被 Agent 更新）
        loadSpecWorkbench(workspace.path, state.slug).then((data) => {
          setDocuments(data.documents);
        });
        setIsRunning(false);
      });
    }
  };

  // 4. 发起 chat_stream，使用 spec profile
  await invoke('chat_stream', {
    sessionId: specSessionId,
    prompt,
    cwd: workspace.path,
    profileId: 'spec',       // Rust 端会加载 spec profile 的配置
    permissionMode: 'full_auto',
    onEvent: channel,
  });
}
```

**注意**：需要确认 Tauri 的 `chat_stream` 命令支持 `profileId: 'spec'` 参数。这个 profile 需要在 Rust 端的配置文件中定义（见第 7 节）。

### 6.2 `SpecStatusHeader.tsx`（简化）

移除与 `waiting_review / waiting_human / paused / failed / ready / planned` 等状态相关的按钮和逻辑，只保留：

| 状态 | 显示 | 按钮 |
|------|------|------|
| `draft` | "草稿" | Run |
| `active` | "执行中" | 中断 |
| `done` | "完成" | — |

如果 `tasks.md` 包含 `> ⚠️` 标记，则在 `active` 状态下额外显示一个橙色警告图标，提示用户需要手动干预。

### 6.3 `helpers.ts`（更新）

```typescript
import type { SpecStatus } from '../domain/types';

export function describeSpecStatus(status: SpecStatus): string {
  const map: Record<SpecStatus, string> = {
    draft:  '草稿',
    active: '执行中',
    done:   '已完成',
  };
  return map[status] ?? status;
}

export function badgeToneForSpecStatus(status: SpecStatus) {
  const map: Record<SpecStatus, 'default' | 'success' | 'warning'> = {
    draft:  'default',
    active: 'warning',
    done:   'success',
  };
  return map[status] ?? 'default';
}
```

### 6.4 `SpecChangesPanel.tsx`（小改动）

将 `item.state.change.status` 改为 `item.state.status`，使用新的 `SpecStatus` 类型（`draft/active/done`）。删除 `metrics.tasks.waitingReview` 的展示逻辑，改为展示 `progress.done / progress.total`。

---

## 7. Rust 端变更

### 7.1 `src-tauri/src/tools/spec_tools.rs`（简化）

保留 `create_spec` 工具，大幅简化其返回的 payload：

```rust
// CreateSpecTool 的 execute 方法返回值简化为：
pub fn execute_create_spec(args: CreateSpecArgs) -> String {
    let payload = serde_json::json!({
        "kind": "spec_tool_result",
        "action": "create_spec",
        "title": args.title,
        "goal": args.goal,
        "overview": args.overview.unwrap_or_default(),
    });
    serde_json::to_string(&payload).unwrap_or_default()
}
```

**删除**：`UpdateSpecTool`、`StartSpecTool`（不再需要 LLM 通过工具启动 spec run）。

### 7.2 Spec Agent Profile 配置

在 Rust 端的 profile 配置文件（通常在 `~/.rhythm/profiles/` 或类似位置）中，新增 `spec` profile：

```toml
[profile.spec]
description = "Spec 任务执行 Agent"
permission_mode = "full_auto"
agent_turn_limit = 40
allowed_tools = ["read_file", "write_file", "edit_file", "list_dir", "shell", "spawn_subagent"]
```

具体配置格式参考现有 `chat` profile 的定义。

---

## 8. 数据流完整示例

### 场景：用户通过聊天创建一个 spec 并运行

```
1. 用户输入："帮我给登录接口添加速率限制"

2. LLM 决策调用 create_spec 工具：
   {
     "title": "添加登录速率限制",
     "goal": "防止登录接口被暴力破解",
     "overview": "在后端添加 rate limiting 中间件"
   }

3. Rust 端返回工具结果 JSON，前端 useLLMStream 检测到
   → 调用 applySpecToolResult()
   → 调用 createSpecInWorkspace()
   → 写入 .spec/changes/add-login-rate-limit/change.md
   → 写入 .spec/changes/add-login-rate-limit/tasks.md（初始模板）
   → 写入 .spec/changes/add-login-rate-limit/state.json（status: draft）
   → 返回 spec://add-login-rate-limit（显示在聊天消息里）

4. 用户点击消息里的 spec URL → 打开 SpecWorkbench

5. 用户（或在 Workbench 里先让 AI 填充 tasks.md）

6. 用户点击 "Run"
   → prepareSpecRun() 将 state.status 改为 active，写入 state.json
   → 构建 spec_agent_prompt（包含 change.md + tasks.md 内容）
   → invoke('chat_stream', { profileId: 'spec', prompt: ... })

7. Spec Agent 在 Rust 端执行：
   - 读取相关代码文件（read_file）
   - 修改代码（edit_file / write_file）
   - 每完成一个 task → edit_file 更新 tasks.md 的 checkbox

8. Agent 完成（stream closed with status=completed）
   → finalizeSpecRun() 重新读 tasks.md
   → parseTaskProgress() 计算 done/total
   → 全部完成 → state.status = done
   → UI 更新显示"已完成"
```

---

## 9. 验收标准

### 必须通过的场景

1. **创建 Spec**：用户在聊天中触发 LLM 调用 `create_spec` 工具 → 工作区有 `.spec/changes/{slug}/` 目录，包含 `change.md`、`tasks.md`、`state.json`
2. **查看 Spec 列表**：`SpecChangesPanel` 正常显示工作区所有 spec changes，显示正确的 `draft/active/done` 状态和进度
3. **打开 Workbench**：点击列表项 → 打开 `SpecWorkbench`，能看到 `change.md` 和 `tasks.md` 内容
4. **执行 Run**：点击 Run 按钮 → `state.json` 变为 `active` → `chat_stream` 被调用 → Agent 开始输出
5. **Agent 更新 checkbox**：Agent 执行过程中，`tasks.md` 的 checkbox 被实际修改（- [ ] → - [x]）
6. **执行完成**：Agent 完成 → `state.json` 变为 `done` → progress 显示 `x/x`
7. **人工检查点**：Agent 写入 `> ⚠️ 需要人工确认：...` → UI 显示橙色警告图标

### 不需要实现的（超出本次范围）

- timeline.jsonl 事件记录
- Spec 归档功能
- Spec 的多 Agent 并发执行
- 复杂的 review / approval 工作流

---

## 10. 注意事项

1. **不要用 `node:path` / `node:fs`**：Tauri 的渲染进程是浏览器环境，无法使用 Node.js 内置模块。路径操作用字符串拼接，文件操作用 `readWorkspaceTextFile` / `writeWorkspaceTextFile`（已有）。

2. **`chat_stream` 的 `profileId` 参数**：需要确认 Rust 端的 `chat_stream` 命令是否支持 `spec` 作为有效的 `profileId`。如果当前不支持，需要在 Rust 配置中添加对应 profile。

3. **Agent 直接改文件**：Spec Agent 会直接用 `edit_file` / `write_file` 工具修改工作区文件（包括 tasks.md）。前端不要 lock 这些文件，Agent 有完整的文件读写权限。

4. **中断后重新 Run**：用户中断后，`state.status` 回到 `draft`，已完成的 task checkbox 保留。再次 Run 时，Agent 会读取最新的 tasks.md，跳过已打勾的任务，继续执行未完成的。

5. **保留 `SpecChangesPanel.tsx` 的加载逻辑**：它从 `.spec/changes/` 目录读取 `state.json`，只需要确保新版 `state.json` 的字段兼容（`status` / `title` / `goal` 字段名不变，`change.status` 改为顶层 `status`）。

---

## 附录：引用的现有 API

以下 API 已存在，可以直接使用：

```typescript
// 文件读写（Tauri 命令封装）
import { readWorkspaceTextFile, writeWorkspaceTextFile } from '@/core/runtime/api/commands';

// 打开 Workbench 导航
import { buildSpecWorkbenchOpenInput } from '../integration/navigation';
import { useSessionStore } from '@/core/sessions/useSessionStore';

// Tauri invoke
import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';
```

Rust 端现有工具（Spec Agent 可以直接使用）：

| 工具名 | 说明 |
|--------|------|
| `read_file` | 读取文件内容 |
| `write_file` | 写入新文件 |
| `edit_file` | 修改现有文件内容（支持字符串替换） |
| `list_dir` | 列出目录内容 |
| `shell` | 执行 shell 命令 |
| `spawn_subagent` | 启动子 Agent 处理并行子任务 |
