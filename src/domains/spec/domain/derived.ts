// 简化的 derived - 适应新的 SpecState 结构
import type { SpecState } from './types';
import { parseTaskProgress } from './stateMachine';

/**
 * 从 tasks.md 计算进度指标
 */
export function computeSpecTaskMetrics(tasksMd: string) {
  return parseTaskProgress(tasksMd);
}

/**
 * 更新 SpecState 的 updatedAt 时间戳
 */
export function refreshDerivedSpecState(state: SpecState, updatedAt = Date.now()): SpecState {
  return {
    ...state,
    updatedAt,
  };
}
