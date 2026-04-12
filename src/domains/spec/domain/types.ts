// 简化后的 Spec 类型定义
// 文档驱动的单任务执行，文档即状态

export type SpecStatus = 'draft' | 'active' | 'done';

export interface SpecState {
  // 不可变元数据
  slug: string;           // URL-safe 唯一标识，如 "add-login-rate-limit"
  mode: 'spec';
  createdAt: number;      // Unix timestamp ms
  updatedAt: number;      // Unix timestamp ms

  // 变更信息（从 proposal.md 提取的结构化缓存，用于 UI 列表展示）
  title: string;
  goal: string;
  overview: string;       // 简短描述，可为空

  // 状态机（三个状态）
  status: SpecStatus;

  // 进度快照（从 tasks.md 实时解析，写入 state.json 用于列表展示）
  progress: {
    total: number;    // tasks.md 里 checkbox 总数
    done: number;     // 已勾选数量
  };
}

export interface SpecDocuments {
  proposal: string; // proposal.md 的完整文本内容
  tasks: string;    // tasks.md 的完整文本内容
}
