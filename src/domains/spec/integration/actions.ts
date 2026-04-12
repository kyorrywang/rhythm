// 简化的 actions - 只保留必要的动作类型
export type SpecIntegrationAction =
  | { type: 'spec.create'; title: string; goal: string; overview?: string }
  | { type: 'spec.run';    slug: string }
  | { type: 'spec.interrupt'; slug: string };
