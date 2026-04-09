import type { WorkflowNodeExecutorDefinition, WorkflowNodeTypeDefinition } from './types';
import { normalizeWorkflowNodeType, parseInputJson, parseMaybeJson, renderWorkflowTemplate, templateScalarValue } from './utils';

const executors = new Map<string, WorkflowNodeExecutorDefinition>();

registerWorkflowNodeExecutor({
  id: 'start',
  title: 'Start',
  description: 'A workflow start node.',
  sourcePlugin: 'workflow',
  defaultConfig: {},
  run: async () => ({ triggered: true }),
});

registerWorkflowNodeExecutor({
  id: 'llm',
  title: 'LLM',
  description: 'Generate text with the active LLM configuration.',
  sourcePlugin: 'workflow',
  defaultConfig: {
    commandId: 'core.llm.complete',
    prompt: 'Summarize the previous workflow context.',
    systemPrompt: '',
    outputMode: 'text',
  },
  run: async ({ ctx, node, nodeRun, run }) => {
    const prompt = renderWorkflowTemplate(String(node.config.prompt || ''), run);
    const systemPrompt = renderWorkflowTemplate(String(node.config.systemPrompt || ''), run);
    const input = {
      prompt,
      systemPrompt,
      providerId: node.config.providerId ? String(node.config.providerId) : undefined,
      model: node.config.model ? String(node.config.model) : undefined,
      timeoutSecs: node.config.timeoutSecs ? Number(node.config.timeoutSecs) : undefined,
    };
    nodeRun.input = input;
    const raw = await ctx.commands.execute<typeof input, { text?: string }>('core.llm.complete', input);
    const text = typeof raw === 'string' ? raw : String((raw as { text?: string } | undefined)?.text || '');
    if (String(node.config.outputMode || 'text') === 'json') {
      const parsed = parseMaybeJson(text);
      if (parsed === null) {
        throw new Error(`${node.title} expected JSON output, but model returned invalid JSON.`);
      }
      const schemaError = validateOutputSchema(parsed, typeof node.config.outputSchema === 'string' ? node.config.outputSchema : undefined);
      if (schemaError) {
        throw new Error(`${node.title} schema validation failed: ${schemaError}`);
      }
      return parsed;
    }
    return text;
  },
});

registerWorkflowNodeExecutor({
  id: 'if',
  title: 'If',
  description: 'Evaluate a simple condition and choose a branch.',
  sourcePlugin: 'workflow',
  defaultConfig: {
    leftValue: '{{previous.output}}',
    operator: 'equals',
    rightValue: 'true',
  },
  run: async ({ node, nodeRun, run }) => {
    const left = templateScalarValue(String(node.config.leftValue || '{{previous.output}}'), run);
    const operator = String(node.config.operator || 'equals');
    const right = templateScalarValue(String(node.config.rightValue || ''), run);
    const matched = evaluateIfCondition(left, operator, right);
    const result = {
      left,
      operator,
      right,
      matched,
      branch: matched ? 'true' : 'false',
    };
    nodeRun.input = { left, operator, right };
    return result;
  },
});

registerWorkflowNodeExecutor({
  id: 'loop',
  title: 'Loop',
  description: 'Run a bounded loop and route to body or done branches.',
  sourcePlugin: 'workflow',
  defaultConfig: {
    mode: 'for_each',
    itemsTemplate: '[]',
    maxIterations: '25',
  },
  run: async ({ node, nodeRun, run }) => {
    const mode = String(node.config.mode || 'for_each');
    const maxIterations = Math.max(1, Number(node.config.maxIterations || '25'));
    run.executionStack = run.executionStack || [];
    let frame = run.executionStack.find((item) => item.type === 'loop' && item.nodeId === node.id);

    if (!frame) {
      frame = {
        type: 'loop',
        nodeId: node.id,
        mode,
        iteration: 0,
        maxIterations,
        items: [],
        cursor: 0,
      };
      if (mode === 'for_each') {
        const itemsValue = templateScalarValue(String(node.config.itemsTemplate || '[]'), run);
        if (!Array.isArray(itemsValue)) {
          throw new Error(`${node.title} expected itemsTemplate to resolve to an array.`);
        }
        frame.items = itemsValue;
      }
      run.executionStack.push(frame);
    }

    if (mode === 'repeat_until') {
      const left = templateScalarValue(String(node.config.leftValue || '{{previous.output}}'), run);
      const operator = String(node.config.operator || 'equals');
      const right = templateScalarValue(String(node.config.rightValue || ''), run);
      const matched = frame.iteration > 0 && evaluateIfCondition(left, operator, right);

      if (matched) {
        run.executionStack = run.executionStack.filter((item) => !(item.type === 'loop' && item.nodeId === node.id));
        delete run.variables.loop;
        const result = {
          mode,
          matched,
          branch: 'done',
          iteration: frame.iteration,
        };
        nodeRun.input = { left, operator, right, maxIterations };
        return result;
      }

      if (frame.iteration >= maxIterations) {
        throw new Error(`${node.title} exceeded maxIterations (${maxIterations}).`);
      }

      run.variables.loop = {
        index: frame.iteration,
        iteration: frame.iteration,
      };
      frame.iteration += 1;
      const result = {
        mode,
        branch: 'body',
        iteration: frame.iteration - 1,
      };
      nodeRun.input = { left, operator, right, maxIterations };
      return result;
    }

    const items = Array.isArray(frame.items) ? frame.items : [];
    const cursor = typeof frame.cursor === 'number' ? frame.cursor : 0;
    if (cursor >= items.length) {
      run.executionStack = run.executionStack.filter((item) => !(item.type === 'loop' && item.nodeId === node.id));
      delete run.variables.loop;
      const result = {
        mode,
        branch: 'done',
        total: items.length,
      };
      nodeRun.input = { itemsTemplate: node.config.itemsTemplate, maxIterations };
      return result;
    }

    if (frame.iteration >= maxIterations) {
      throw new Error(`${node.title} exceeded maxIterations (${maxIterations}).`);
    }

    const item = items[cursor];
    run.variables.loop = {
      index: cursor,
      iteration: frame.iteration,
      item,
    };
    frame.cursor = cursor + 1;
    frame.iteration += 1;
    const result = {
      mode,
      branch: 'body',
      index: cursor,
      iteration: frame.iteration - 1,
      item,
      total: items.length,
    };
    nodeRun.input = { itemsTemplate: node.config.itemsTemplate, maxIterations };
    return result;
  },
});

registerWorkflowNodeExecutor({
  id: 'shell',
  title: 'Shell',
  description: 'Run a shell command via tool.shell.',
  sourcePlugin: 'workflow',
  defaultConfig: { command: 'echo hello' },
  run: async ({ ctx, node, nodeRun, signal, update }) => {
    const command = String(node.config.command || '');
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
    const commandId = String(node.config.commandId || '');
    if (!commandId.trim()) throw new Error(`${node.title} missing command id`);
    const input = parseInputJson(typeof node.config.inputJson === 'string' ? node.config.inputJson : undefined);
    nodeRun.input = input;
    return ctx.commands.execute(commandId, input);
  },
});

export function registerWorkflowNodeType(definition: WorkflowNodeTypeDefinition) {
  const normalized = normalizeWorkflowNodeType(definition.id);
  if (!normalized.trim()) throw new Error('Workflow node type id is required.');
  const registered = { ...definition, id: normalized };
  registerWorkflowNodeExecutor(commandBackedExecutor(registered));
  return registered;
}

export function registerWorkflowNodeExecutor(definition: WorkflowNodeExecutorDefinition) {
  const normalized = normalizeWorkflowNodeType(definition.id);
  if (!normalized.trim()) throw new Error('Workflow node executor id is required.');
  const registered = { ...definition, id: normalized };
  executors.set(normalized, registered);
  return registered;
}

export function listWorkflowNodeTypes() {
  return [...executors.values()].map(({ run: _run, ...definition }) => definition);
}

export function getWorkflowNodeType(id: string) {
  const definition = executors.get(normalizeWorkflowNodeType(id));
  if (!definition) return undefined;
  const { run: _run, ...metadata } = definition;
  return metadata;
}

export function getWorkflowNodeExecutor(id: string) {
  return executors.get(normalizeWorkflowNodeType(id));
}

function commandBackedExecutor(definition: WorkflowNodeTypeDefinition): WorkflowNodeExecutorDefinition {
  return {
    ...definition,
    run: async ({ ctx, node, nodeRun }) => {
      const commandId = String(node.config.commandId || definition.commandId || '');
      if (!commandId.trim()) throw new Error(`${node.title} has no command-backed implementation`);
      const input = parseInputJson(typeof node.config.inputJson === 'string' ? node.config.inputJson : undefined);
      nodeRun.input = input;
      return ctx.commands.execute(commandId, input);
    },
  };
}

function evaluateIfCondition(left: unknown, operator: string, right: unknown) {
  if (operator === 'exists') {
    return left !== undefined && left !== null && String(left).length > 0;
  }
  if (operator === 'contains') {
    return String(left).includes(String(right));
  }
  if (operator === 'greater_than') {
    return Number(left) > Number(right);
  }
  if (operator === 'not_equals') {
    return String(left) !== String(right);
  }
  return String(left) === String(right);
}

function validateOutputSchema(value: unknown, schemaText?: string) {
  if (!schemaText?.trim()) return null;
  const schema = parseMaybeJson(schemaText);
  if (!schema || typeof schema !== 'object') return 'outputSchema is not valid JSON';
  const descriptor = schema as {
    type?: string;
    required?: string[];
    properties?: Record<string, { type?: string }>;
  };
  if (descriptor.type && !matchesSchemaType(value, descriptor.type)) {
    return `expected ${descriptor.type}`;
  }
  if (descriptor.type === 'object' && descriptor.required && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const missing = descriptor.required.find((key) => record[key] === undefined);
    if (missing) return `missing required property '${missing}'`;
  }
  if (descriptor.type === 'object' && descriptor.properties && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const [key, property] of Object.entries(descriptor.properties)) {
      if (record[key] !== undefined && property.type && !matchesSchemaType(record[key], property.type)) {
        return `property '${key}' expected ${property.type}`;
      }
    }
  }
  return null;
}

function matchesSchemaType(value: unknown, type: string) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'null') return value === null;
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number';
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === type;
}
