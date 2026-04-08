import type { PluginContext } from '../../../src/plugin/sdk';
import { DEVELOPER_COMMANDS } from './constants';

const WORKFLOW_READY_EVENT = 'workflow.ready';
const WORKFLOW_REGISTER_EVENT = 'workflow.nodeType.register';

export function registerDeveloperWorkflowNodes(ctx: PluginContext) {
  const contribute = () => {
    ctx.events.emit(WORKFLOW_REGISTER_EVENT, {
      id: 'developer.validation',
      title: 'Developer Validation',
      description: 'Run a validation command through the Developer plugin.',
      sourcePlugin: 'developer',
      commandId: DEVELOPER_COMMANDS.runValidation,
      defaultConfig: {
        commandId: DEVELOPER_COMMANDS.runValidation,
        inputJson: '{ "command": "npm run typecheck" }',
      },
    });
    ctx.events.emit(WORKFLOW_REGISTER_EVENT, {
      id: 'developer.gitDiff',
      title: 'Developer Git Diff',
      description: 'Open a Developer git diff payload.',
      sourcePlugin: 'developer',
      commandId: DEVELOPER_COMMANDS.gitDiff,
      defaultConfig: {
        commandId: DEVELOPER_COMMANDS.gitDiff,
        inputJson: '{}',
      },
    });
  };

  const disposable = ctx.events.on(WORKFLOW_READY_EVENT, contribute);
  queueMicrotask(contribute);
  return disposable;
}
