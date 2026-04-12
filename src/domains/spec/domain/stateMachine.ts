// 简化的状态机 - 只有 3 个状态
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
