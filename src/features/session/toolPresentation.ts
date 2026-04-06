import { ToolCall } from '@/shared/types/schema';

export interface ToolPresentation {
  title: string;
  summary: string;
  details: string;
  actionLabel?: string;
  actionTarget?: {
    mode: 'file' | 'diff' | 'web' | 'task';
    title: string;
    description?: string;
    content?: string;
    meta?: {
      path?: string;
      url?: string;
      summary?: string;
    };
  };
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
    actionLabel: inferShellActionLabel(tool),
    actionTarget: inferShellActionTarget(tool),
  }),
  read: (tool) => ({
    title: 'Read',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
    actionLabel: '在 Workbench 中打开',
    actionTarget: {
      mode: 'file',
      title: String(toolArgs(tool).path || '文件预览'),
      description: '读取结果预览',
      content: joinLogs(tool),
      meta: {
        path: String(toolArgs(tool).path || ''),
      },
    },
  }),
  write: (tool) => ({
    title: 'Write',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
    actionLabel: '查看写入结果',
    actionTarget: {
      mode: 'file',
      title: String(toolArgs(tool).path || '写入结果'),
      description: '最终文件内容或写入输出',
      content: joinLogs(tool),
      meta: {
        path: String(toolArgs(tool).path || ''),
      },
    },
  }),
  edit: (tool) => ({
    title: 'Edit',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
    actionLabel: '查看 Diff',
    actionTarget: {
      mode: 'diff',
      title: String(toolArgs(tool).path || 'Diff'),
      description: '编辑 patch 与变更输出',
      content: joinLogs(tool),
      meta: {
        path: String(toolArgs(tool).path || ''),
      },
    },
  }),
  delete: (tool) => ({
    title: 'Delete',
    summary: String(toolArgs(tool).path || ''),
    details: joinLogs(tool),
    actionLabel: '查看删除结果',
    actionTarget: {
      mode: 'task',
      title: String(toolArgs(tool).path || '删除结果'),
      description: '删除日志与影响范围',
      content: joinLogs(tool),
      meta: {
        path: String(toolArgs(tool).path || ''),
      },
    },
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

function inferShellActionTarget(tool: ToolCall): ToolPresentation['actionTarget'] | undefined {
  const logs = joinLogs(tool);
  const command = String(toolArgs(tool).command || '');
  const match = logs.match(/https?:\/\/[^\s]+|http:\/\/localhost:\d+[^\s]*/i);
  if (match) {
    return {
      mode: 'web',
      title: match[0],
      description: `来自命令: ${command || 'shell'}`,
      content: logs,
      meta: {
        url: match[0],
        summary: command,
      },
    };
  }

  return {
    mode: 'task',
    title: command || 'Shell 输出',
    description: 'stdout / stderr / 退出结果',
    content: logs,
    meta: {
      summary: command,
    },
  };
}

function inferShellActionLabel(tool: ToolCall): string {
  const logs = joinLogs(tool);
  return /https?:\/\/[^\s]+/i.test(logs) ? '在 Workbench 中预览' : '查看输出';
}
