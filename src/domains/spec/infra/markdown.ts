// 简化的 Markdown 渲染 - 只保留两个渲染函数
import type { SpecState } from '../domain/types';

/** 根据 SpecState 渲染初始的 proposal.md 模板 */
export function renderInitialProposalMd(state: SpecState): string {
  return `# ${state.title}

## 目标
${state.goal}

## 概述
${state.overview || ''}

## 范围
- 包含：
- 不包含：

## 约束

## 成功标准
- [ ] 
`;
}

/** 渲染初始的 tasks.md 模板（Agent 会填充具体任务） */
export function renderInitialTasksMd(state: SpecState): string {
  return `# Tasks: ${state.title}

<!-- Agent 将在此填充具体任务列表 -->
- [ ] 分析需求，制定任务计划
`;
}
