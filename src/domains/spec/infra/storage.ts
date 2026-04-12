// 简化的 storage - 使用 Tauri API 替代 node:fs
import { readWorkspaceTextFile, writeWorkspaceTextFile } from '@/core/runtime/api/commands';
import { getSpecRelativePaths } from '../infra/changeFs';
import type { SpecState } from '../domain/types';

export async function listSpecWorkbenches(_workspacePath: string) {
  // 简化版：返回空数组，实际应该扫描 .spec/changes 目录
  // 这个功能可能需要在 Rust 端实现
  return [];
}

export async function loadSpecWorkbench(workspacePath: string, slug: string): Promise<SpecState | null> {
  try {
    const paths = getSpecRelativePaths(slug);
    const stateFile = await readWorkspaceTextFile(workspacePath, paths.state);
    if (!stateFile.content) return null;
    return JSON.parse(stateFile.content) as SpecState;
  } catch {
    return null;
  }
}

export async function saveSpecWorkbench(workspacePath: string, state: SpecState) {
  const paths = getSpecRelativePaths(state.slug);
  await writeWorkspaceTextFile(workspacePath, paths.state, JSON.stringify(state, null, 2));
}
