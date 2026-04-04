import { ToolCall } from '@/types/schema';

export interface ToolPresentation {
  title: string;
  summary: string;
  details: string;
  defaultExpanded: boolean;
}

type ToolPresenter = (tool: ToolCall) => ToolPresentation;

const toTitleCase = (name: string) =>
  name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const joinLogs = (tool: ToolCall) => (tool.logs && tool.logs.length > 0 ? tool.logs.join('\n') : '');

const presenters: Record<string, ToolPresenter> = {
  shell: (tool) => ({
    title: 'Shell',
    summary: tool.arguments?.command || '命令',
    details: joinLogs(tool),
    defaultExpanded: tool.status === 'running',
  }),
  file_system: (tool) => {
    const action = tool.arguments?.action;
    const path = tool.arguments?.path;
    const fallbackDetails =
      action === 'write' && tool.arguments?.content
        ? `Writing ${path}\n\n${tool.arguments.content}`
        : '';

    return {
      title: 'File System',
      summary:
        action === 'list'
          ? `列出 ${path}`
          : action === 'read'
            ? `读取 ${path}`
            : action === 'write'
              ? `写入 ${path}`
              : JSON.stringify(tool.arguments),
      details: joinLogs(tool) || fallbackDetails,
      defaultExpanded: tool.status === 'running',
    };
  },
  ask_user: (tool) => ({
    title: 'Ask User',
    summary: tool.arguments?.question || '等待用户输入',
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
    title: toTitleCase(tool.name),
    summary: JSON.stringify(tool.arguments),
    details: joinLogs(tool),
    defaultExpanded: tool.status === 'running',
  };
};
