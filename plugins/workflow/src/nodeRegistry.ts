import type { WorkflowNodeExecutorDefinition, WorkflowNodeTypeDefinition } from './types';
import { parseInputJson } from './utils';

const executors = new Map<string, WorkflowNodeExecutorDefinition>();

registerWorkflowNodeExecutor({
  id: 'manual',
  title: 'Manual',
  description: 'A manual trigger node.',
  sourcePlugin: 'workflow',
  defaultConfig: {},
  run: async () => ({ triggered: true }),
});

registerWorkflowNodeExecutor({
  id: 'workflow.llm',
  title: 'LLM',
  description: 'Generate text with the active LLM configuration.',
  sourcePlugin: 'workflow',
  defaultConfig: {
    commandId: 'core.llm.complete',
    prompt: 'Summarize the previous workflow context.',
    systemPrompt: '',
  },
  run: async ({ ctx, node, nodeRun, run }) => {
    const prompt = renderWorkflowTemplate(node.config.prompt || '', run);
    const systemPrompt = renderWorkflowTemplate(node.config.systemPrompt || '', run);
    const input = {
      prompt,
      systemPrompt,
      providerId: node.config.providerId || undefined,
      model: node.config.model || undefined,
      timeoutSecs: node.config.timeoutSecs ? Number(node.config.timeoutSecs) : undefined,
    };
    nodeRun.input = input;
    return ctx.commands.execute('core.llm.complete', input);
  },
});

registerWorkflowNodeExecutor({
  id: 'shell',
  title: 'Shell',
  description: 'Run a shell command via tool.shell.',
  sourcePlugin: 'workflow',
  defaultConfig: { command: 'echo hello' },
  run: async ({ ctx, node, nodeRun, signal, update }) => {
    const command = node.config.command || '';
    nodeRun.input = { command };
    if (!command.trim()) throw new Error(`${node.title} missing shell command`);
    const running = await ctx.commands.start<{ command: string }, unknown>(
      'tool.shell',
      { command },
      (event) => {
        if (event.type === 'stdout' || event.type === 'stderr') {
          nodeRun.logs.push(event.chunk);
          void update();
        } else if (event.type === 'cancelled') {
          nodeRun.status = 'cancelled';
          nodeRun.endedAt = Date.now();
          void update();
        } else if (event.type === 'error') {
          nodeRun.error = event.message;
          nodeRun.logs.push(event.message);
          void update();
        }
      },
    );
    signal.setRunningCommand(running);
    const result = await running.result;
    signal.setRunningCommand(undefined);
    return result;
  },
});

registerWorkflowNodeExecutor({
  id: 'command',
  title: 'Command',
  description: 'Run any command through ctx.commands.execute.',
  sourcePlugin: 'workflow',
  defaultConfig: { commandId: 'tool.shell', inputJson: '{ "command": "echo hello" }' },
  run: async ({ ctx, node, nodeRun }) => {
    const commandId = node.config.commandId || '';
    if (!commandId.trim()) throw new Error(`${node.title} missing command id`);
    const input = parseInputJson(node.config.inputJson);
    nodeRun.input = input;
    return ctx.commands.execute(commandId, input);
  },
});

export function registerWorkflowNodeType(definition: WorkflowNodeTypeDefinition) {
  if (!definition.id.trim()) throw new Error('Workflow node type id is required.');
  registerWorkflowNodeExecutor(commandBackedExecutor(definition));
  return definition;
}

export function registerWorkflowNodeExecutor(definition: WorkflowNodeExecutorDefinition) {
  if (!definition.id.trim()) throw new Error('Workflow node executor id is required.');
  executors.set(definition.id, definition);
  return definition;
}

export function listWorkflowNodeTypes() {
  return [...executors.values()].map(({ run: _run, ...definition }) => definition);
}

export function getWorkflowNodeType(id: string) {
  const definition = executors.get(id);
  if (!definition) return undefined;
  const { run: _run, ...metadata } = definition;
  return metadata;
}

export function getWorkflowNodeExecutor(id: string) {
  return executors.get(id);
}

function commandBackedExecutor(definition: WorkflowNodeTypeDefinition): WorkflowNodeExecutorDefinition {
  return {
    ...definition,
    run: async ({ ctx, node, nodeRun }) => {
      const commandId = node.config.commandId || definition.commandId || '';
      if (!commandId.trim()) throw new Error(`${node.title} has no command-backed implementation`);
      const input = parseInputJson(node.config.inputJson);
      nodeRun.input = input;
      return ctx.commands.execute(commandId, input);
    },
  };
}

function renderWorkflowTemplate(template: string, run: { nodeRuns: Record<string, { output?: unknown; logs?: string[] }> }) {
  return template
    .replace(/\{\{\s*previous\.output\s*\}\}/g, () => {
      const previous = findPreviousNodeRun(run, (nodeRun) => nodeRun.output !== undefined);
      return previous?.output === undefined ? '' : stringifyTemplateValue(previous.output);
    })
    .replace(/\{\{\s*previous\.logs\s*\}\}/g, () => {
      const previous = findPreviousNodeRun(run, (nodeRun) => Boolean(nodeRun.logs && nodeRun.logs.length > 0));
      return previous?.logs?.join('') || '';
    })
    .replace(/\{\{\s*node\.([^.}]+)\.output\s*\}\}/g, (_match, nodeId: string) => {
      const value = run.nodeRuns[nodeId]?.output;
      return value === undefined ? '' : stringifyTemplateValue(value);
    })
    .replace(/\{\{\s*node\.([^.}]+)\.logs\s*\}\}/g, (_match, nodeId: string) => run.nodeRuns[nodeId]?.logs?.join('') || '');
}

function stringifyTemplateValue(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function findPreviousNodeRun(
  run: { nodeRuns: Record<string, { output?: unknown; logs?: string[] }> },
  predicate: (nodeRun: { output?: unknown; logs?: string[] }) => boolean,
) {
  const nodeRuns = Object.values(run.nodeRuns);
  for (let index = nodeRuns.length - 1; index >= 0; index -= 1) {
    if (predicate(nodeRuns[index])) return nodeRuns[index];
  }
  return undefined;
}
