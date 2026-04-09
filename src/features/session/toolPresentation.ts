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

const presenters: Record<string, ToolPresenter> = {
  shell: (tool) => ({
    title: 'Shell',
    summary: String(toolArgs(tool).command || '命令'),
    details: joinLogs(tool),
  }),
  read: (tool) => ({
    title: 'Read',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
  }),
  write: (tool) => ({
    title: 'Write',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
  }),
  edit: (tool) => ({
    title: 'Edit',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
  }),
  delete: (tool) => ({
    title: 'Delete',
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
    details: joinLogs(tool),
  };
};
