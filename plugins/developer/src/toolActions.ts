import type { LeftPanelProps } from '../../../src/plugin/sdk';
import type { ToolCall } from '../../../src/shared/types/schema';
import { DEVELOPER_VIEWS } from './constants';
import type { LogPayload } from './types';

export function registerDeveloperToolActions(ctx: LeftPanelProps['ctx']) {
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
    duration_ms: (tool.endedAt && tool.startedAt) ? Math.max(0, tool.endedAt - tool.startedAt) : 0,
    source: 'tool',
  };
}
