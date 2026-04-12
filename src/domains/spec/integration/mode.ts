// 简化的 mode 定义
import type { SpecIntegrationAction } from './actions';

export interface SpecModeDefinition {
  id: 'spec';
  label: string;
  description: string;
  actions: SpecIntegrationAction['type'][];
}

export const SPEC_MODE_DEFINITION: SpecModeDefinition = {
  id: 'spec',
  label: 'Spec',
  description: '文档驱动的单任务执行模式',
  actions: [
    'spec.create',
    'spec.run',
    'spec.interrupt',
  ],
};
