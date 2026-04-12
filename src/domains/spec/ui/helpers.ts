// 更新的 helpers - 简化版本
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
