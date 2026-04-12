// 简化的 editor - 保留核心逻辑
import { makeSpecChangeSlug } from '../infra/changeFs';
import { renderInitialProposalMd, renderInitialTasksMd } from '../infra/markdown';
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
    proposal: renderInitialProposalMd(state),
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
