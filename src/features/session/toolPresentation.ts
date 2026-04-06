import { ToolCall } from '@/types/schema';

export interface ToolPresentation {
  title: string;
  summary: string;
  details: string;
}

type ToolPresenter = (tool: ToolCall) => ToolPresentation;

const joinLogs = (tool: ToolCall) => (tool.logs && tool.logs.length > 0 ? tool.logs.join('\n') : '');
const toolArgs = (tool: ToolCall): Record<string, unknown> =>
  tool.arguments && typeof tool.arguments === 'object' ? (tool.arguments as Record<string, unknown>) : {};

const presenters: Record<string, ToolPresenter> = {
  shell: (tool) => ({
    title: 'Shell',
    summary: String(toolArgs(tool).command || '命令'),
    details: joinLogs(tool),
  }),
  read: (tool) => ({
    title: 'READ',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
  }),
  write: (tool) => ({
    title: 'WRITE',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
  }),
  edit: (tool) => ({
    title: 'EDIT',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
  }),
  delete: (tool) => ({
    title: 'DELETE',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
  }),
  spawn_subagent: (tool) => {
    const args = toolArgs(tool);
    const title = String(args.title || args.message || '启动子代理');
    const shortTitle = title.length > 20 ? title.slice(0, 20) + '...' : title;
    return {
      title: 'Dynamic 智能体',
      summary: shortTitle,
      details: joinLogs(tool),
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
    summary: String(toolArgs(tool).path || JSON.stringify(tool.arguments)),
    details: joinLogs(tool),
  };
};
