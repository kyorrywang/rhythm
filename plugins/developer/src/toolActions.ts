import type { LeftPanelProps } from '../../../src/plugin-host';
import type { ToolCall } from '../../../src/shared/types/schema';
import { DEVELOPER_STORAGE_KEYS, DEVELOPER_VIEWS } from './constants';
import type { DiffPayload, LogPayload, ValidationPayload } from './types';

export function registerDeveloperToolActions(ctx: LeftPanelProps['ctx']) {
  ctx.ui.messageActions.register({
    id: 'developer.openLatestDiff',
    title: 'Open Latest Diff',
    description: 'Open the latest Developer diff snapshot.',
    order: 20,
    run: async ({ ctx }) => {
      const payload = await ctx.storage.get<DiffPayload>(DEVELOPER_STORAGE_KEYS.latestDiff);
      if (!payload) return;
      ctx.ui.workbench.open({
        viewId: DEVELOPER_VIEWS.diff,
        title: payload.title,
        description: `${payload.files.length} changed file(s)`,
        payload,
      });
    },
  });

  ctx.ui.messageActions.register({
    id: 'developer.openLatestValidation',
    title: 'Open Latest Validation',
    description: 'Open the latest Developer validation snapshot.',
    order: 21,
    run: async ({ ctx }) => {
      const payload = await ctx.storage.get<ValidationPayload>(DEVELOPER_STORAGE_KEYS.latestValidation);
      if (!payload) return;
      ctx.ui.workbench.open({
        viewId: DEVELOPER_VIEWS.validation,
        title: `Validation: ${payload.command}`,
        description: payload.success ? 'Validation passed' : `${payload.issues.length} issue(s) detected`,
        payload,
      });
    },
  });

  ctx.ui.toolResultActions.register({
    id: 'developer.openShellLog',
    title: 'Open Log',
    description: 'Open shell tool output in the Developer log view.',
    order: 10,
    when: ({ tool }) => tool.name === 'shell' && tool.status !== 'running',
    run: ({ ctx, tool }) => {
      ctx.ui.workbench.open<LogPayload>({
        viewId: DEVELOPER_VIEWS.log,
        title: shellToolTitle(tool),
        description: 'Shell tool output',
        payload: shellToolToLogPayload(tool),
      });
    },
  });
}

function shellToolTitle(tool: ToolCall) {
  const args = tool.arguments && typeof tool.arguments === 'object' ? tool.arguments as { command?: string } : {};
  return args.command || 'Shell Log';
}

function shellToolToLogPayload(tool: ToolCall): LogPayload {
  const command = shellToolTitle(tool);
  const output = [tool.logs?.join('\n'), tool.result].filter(Boolean).join('\n');
  return {
    command,
    stdout: output,
    stderr: tool.status === 'error' ? output : '',
    exit_code: tool.status === 'error' ? 1 : 0,
    success: tool.status !== 'error',
    timed_out: false,
    truncated: false,
    duration_ms: tool.executionTime || 0,
    source: 'tool',
  };
}
