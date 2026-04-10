import { ToolCall } from '@/shared/types/schema';

export interface ToolPresentation {
  title: string;
  summary: string;
  details: string;
}

type ToolPresenter = (tool: ToolCall) => ToolPresentation;

const joinLogs = (tool: ToolCall) => (tool.logs && tool.logs.length > 0 ? tool.logs.join('\n') : '');
const toolArgs = (tool: ToolCall): Record<string, unknown> =>
  tool.arguments && typeof tool.arguments === 'object' ? (tool.arguments as Record<string, unknown>) : {};
const stringArg = (tool: ToolCall, key: string) => {
  const value = toolArgs(tool)[key];
  return typeof value === 'string' ? value : '';
};
const previewText = (value: string, maxLength = 1200) => {
  if (!value) return '';
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n\n[Preview truncated]` : value;
};
const fallbackToolDetails = (tool: ToolCall) => {
  const args = toolArgs(tool);
  const path = typeof args.path === 'string' ? args.path : '';
  const statusText = tool.status === 'running' ? '正在执行' : tool.status === 'error' ? '执行失败' : '执行完成';

  if (tool.name === 'write') {
    const content = typeof args.content === 'string' ? args.content : '';
    return [
      `${statusText}: ${path || '目标文件'}`,
      content ? `待写入内容长度: ${content.length} 字符` : '待写入内容已生成，等待落盘。',
      content ? `\n--- Content Preview ---\n${previewText(content)}` : '',
    ].join('\n');
  }

  if (tool.name === 'edit') {
    const search = typeof args.search === 'string' ? args.search : '';
    const replace = typeof args.replace === 'string' ? args.replace : '';
    return [
      `${statusText}: ${path || '目标文件'}`,
      search ? `查找片段长度: ${search.length} 字符` : '已收到查找片段。',
      replace ? `替换片段长度: ${replace.length} 字符` : '已收到替换片段。',
      search ? `\n--- Search Preview ---\n${previewText(search, 400)}` : '',
      replace ? `\n--- Replace Preview ---\n${previewText(replace)}` : '',
    ].join('\n');
  }

  if (tool.name === 'read') {
    return `${statusText}: ${path || '目标文件'}`;
  }

  if (tool.name === 'delete') {
    return `${statusText}: ${path || '目标文件'}`;
  }

  return '';
};
const detailsForTool = (tool: ToolCall) => joinLogs(tool) || tool.result || fallbackToolDetails(tool);

const presenters: Record<string, ToolPresenter> = {
  shell: (tool) => ({
    title: 'Shell',
    summary: String(toolArgs(tool).command || '命令'),
    details: detailsForTool(tool),
  }),
  read: (tool) => ({
    title: 'Read',
    summary: stringArg(tool, 'path'),
    details: detailsForTool(tool),
  }),
  write: (tool) => ({
    title: 'Write',
    summary: stringArg(tool, 'path'),
    details: detailsForTool(tool),
  }),
  edit: (tool) => ({
    title: 'Edit',
    summary: stringArg(tool, 'path'),
    details: detailsForTool(tool),
  }),
  delete: (tool) => ({
    title: 'Delete',
    summary: stringArg(tool, 'path'),
    details: detailsForTool(tool),
  }),
  spawn_subagent: (tool) => {
    const args = toolArgs(tool);
    const title = String(args.title || args.message || '启动子代理');
    const shortTitle = title.length > 20 ? title.slice(0, 20) + '...' : title;
    return {
      title: 'Dynamic 智能体',
      summary: shortTitle,
      details: detailsForTool(tool),
    };
  },
  'orchestrator.createTemplate': () => ({
    title: 'Agent 编排器模板',
    summary: '创建模板',
    details: '',
  }),
  'orchestrator.createSampleNovelTemplate': () => ({
    title: 'Agent 编排器模板',
    summary: '创建小说模板',
    details: '',
  }),
  'orchestrator.createSampleSoftwareTemplate': () => ({
    title: 'Agent 编排器模板',
    summary: '创建软件模板',
    details: '',
  }),
  'orchestrator.updateTemplate': () => ({
    title: 'Agent 编排器模板',
    summary: '更新模板',
    details: '',
  }),
  'orchestrator.duplicateTemplate': () => ({
    title: 'Agent 编排器模板',
    summary: '复制模板',
    details: '',
  }),
  'orchestrator.createRun': () => ({
    title: 'Agent 编排器',
    summary: '启动运行',
    details: '',
  }),
  'orchestrator.getRun': () => ({
    title: 'Agent 编排器',
    summary: '查看运行',
    details: '',
  }),
  'orchestrator.pauseRun': () => ({
    title: 'Agent 编排器',
    summary: '暂停运行',
    details: '',
  }),
  'orchestrator.resumeRun': () => ({
    title: 'Agent 编排器',
    summary: '继续运行',
    details: '',
  }),
  'orchestrator.cancelRun': () => ({
    title: 'Agent 编排器',
    summary: '取消运行',
    details: '',
  }),
};

export const getToolPresentation = (tool: ToolCall): ToolPresentation => {
  const presenter = presenters[tool.name];
  if (presenter) {
    return presenter(tool);
  }

  return {
    title: tool.name,
    summary: String(toolArgs(tool).path || JSON.stringify(tool.arguments)),
    details: detailsForTool(tool),
  };
};
