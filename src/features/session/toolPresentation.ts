import { ToolCall } from '@/types/schema';

export interface ToolPresentation {
  title: string;
  summary: string;
  details: string;
  defaultExpanded: boolean;
}

type ToolPresenter = (tool: ToolCall) => ToolPresentation;

const joinLogs = (tool: ToolCall) => (tool.logs && tool.logs.length > 0 ? tool.logs.join('\n') : '');

const presenters: Record<string, ToolPresenter> = {
  shell: (tool) => ({
    title: 'Shell',
    summary: tool.arguments?.command || '命令',
    details: joinLogs(tool),
    defaultExpanded: tool.status === 'running',
  }),
  read: (tool) => ({
    title: 'READ',
    summary: tool.arguments?.path || '',
    details: joinLogs(tool),
    defaultExpanded: tool.status === 'running',
  }),
  write: (tool) => ({
    title: 'WRITE',
    summary: tool.arguments?.path || '',
    details: joinLogs(tool),
    defaultExpanded: tool.status === 'running',
  }),
  edit: (tool) => ({
    title: 'EDIT',
    summary: tool.arguments?.path || '',
    details: joinLogs(tool),
    defaultExpanded: tool.status === 'running',
  }),
  delete: (tool) => ({
    title: 'DELETE',
    summary: tool.arguments?.path || '',
    details: joinLogs(tool),
    defaultExpanded: tool.status === 'running',
  }),
  spawn_subagent: (tool) => {
    const title = tool.arguments?.title || tool.arguments?.message || '启动子代理';
    const shortTitle = title.length > 20 ? title.slice(0, 20) + '...' : title;
    return {
      title: 'Dynamic 智能体',
      summary: shortTitle,
      details: joinLogs(tool),
      defaultExpanded: false,
    };
  },
};

export const getToolPresentation = (tool: ToolCall): ToolPresentation => {
  const presenter = presenters[tool.name];
  if (presenter) {
    return presenter(tool);
  }

  return {
    title: tool.name,
    summary: tool.arguments?.path || JSON.stringify(tool.arguments),
    details: joinLogs(tool),
    defaultExpanded: tool.status === 'running',
  };
};
