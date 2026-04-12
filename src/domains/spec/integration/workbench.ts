// 重写后的 workbench - 简化版本
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
  const [stateFile, proposalFile, tasksFile] = await Promise.all([
    readWorkspaceTextFile(workspacePath, paths.state),
    readWorkspaceTextFile(workspacePath, paths.proposal),
    readWorkspaceTextFile(workspacePath, paths.tasks),
  ]);

  if (!stateFile.content) throw new Error(`Spec not found: ${slug}`);

  const state = JSON.parse(stateFile.content) as SpecState;
  return {
    state,
    documents: {
      proposal: proposalFile.content || '',
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
    writeWorkspaceTextFile(workspacePath, paths.proposal, documents.proposal),
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
  const prompt = buildSpecAgentPrompt(documents.proposal, documents.tasks);
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

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * 列出所有 spec changes。
 * 注意：简化版本返回空数组，完整实现需要在 Rust 端提供扫描 API。
 */
export async function listSpecWorkbenches(_workspacePath: string): Promise<SpecState[]> {
  // TODO: 实现扫描逻辑，需要在 Rust 端提供 API
  return [];
}
