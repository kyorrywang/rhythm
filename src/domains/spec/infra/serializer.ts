// 简化的 serializer
import type { SpecState } from '../domain/types';

export function serializeSpecState(state: SpecState) {
  return JSON.stringify(state, null, 2);
}

export function deserializeSpecState(raw: string): SpecState {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // 简化验证逻辑
  if (typeof parsed !== 'object' || parsed === null || parsed['mode'] !== 'spec') {
    throw new Error('Invalid spec state payload.');
  }
  return parsed as unknown as SpecState;
}
