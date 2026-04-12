// 简化后的路径管理 - 去掉 node:path 依赖
// 在 Tauri 渲染进程中不能使用 node:path，改用纯字符串操作

export const SPEC_ROOT = '.spec';
export const SPEC_CHANGES_DIR = '.spec/changes';

export function makeSpecChangeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'change';
}

export function getSpecRelativePaths(slug: string) {
  const base = `${SPEC_CHANGES_DIR}/${slug}`;
  return {
    changeDir: base,
    proposal:  `${base}/proposal.md`,
    tasks:     `${base}/tasks.md`,
    state:     `${base}/state.json`,
    artifacts: `${base}/artifacts`,
  };
}
