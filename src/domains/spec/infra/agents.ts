// 简化的 Agent 配置 - 只有 1 个 spec-agent profile
export const SPEC_MODE_ID = 'spec';
export const SPEC_AGENT_PROFILE_ID = 'spec-agent';

/**
 * 构建发送给 Spec Agent 的 prompt。
 * Agent 会读取这两个文档，逐个执行 tasks.md 里的 task，
 * 完成每个 task 后把对应 checkbox 改为 [x]。
 */
export function buildSpecAgentPrompt(proposalMd: string, tasksMd: string): string {
  return `你是一个 AI 编程助手，正在执行一个 Spec 变更任务。

## 变更定义
${proposalMd}

## 当前任务列表
${tasksMd}

## 执行规则
1. 按顺序逐个执行 tasks.md 里未完成（- [ ]）的任务
2. 每完成一个任务，立即把 tasks.md 中对应的 - [ ] 改为 - [x]（使用 edit_file 工具）
3. 如果遇到需要人工确认的情况，在 tasks.md 的相关任务下方插入一行：
   > ⚠️ 需要人工确认：{具体说明}
   然后停止执行，等待人工介入。
4. 所有任务完成后，停止并输出简短总结。
5. 产出的文件放在 .spec/changes/{slug}/artifacts/ 目录下。

现在开始执行。`;
}
