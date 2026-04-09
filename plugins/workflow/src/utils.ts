import type { WorkflowDefinition, WorkflowEdge, WorkflowExportEnvelope, WorkflowNode, WorkflowNodeRun, WorkflowRun } from './types';
import { getWorkflowNodeType } from './nodeRegistry';

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeWorkflowNodeType(type: string): WorkflowNode['type'] {
  if (type === 'manual') return 'start';
  if (type === 'workflow.llm') return 'llm';
  return (type || 'start') as WorkflowNode['type'];
}

export function createDefaultWorkflow(name = 'Untitled Workflow'): WorkflowDefinition {
  const now = Date.now();
  const start: WorkflowNode = {
    id: createId('node'),
    type: 'start',
    title: 'Start',
    config: {},
    position: { x: 0, y: 0 },
  };
  const llm: WorkflowNode = {
    id: createId('node'),
    type: 'llm',
    title: 'LLM',
    config: {
      systemPrompt: '',
      prompt: 'Summarize the workflow input and decide the next action.',
      timeoutSecs: '30',
      outputMode: 'text',
    },
    position: { x: 220, y: 0 },
  };
  return {
    id: createId('wf'),
    name,
    description: 'Start with an LLM node, then add control-flow nodes around it.',
    version: 1,
    nodes: [start, llm],
    edges: [{ id: createId('edge'), from: start.id, to: llm.id }],
    createdAt: now,
    updatedAt: now,
  };
}

export function createLlmIfTemplateWorkflow(name = 'LLM Decide') {
  const now = Date.now();
  const start: WorkflowNode = {
    id: createId('node'),
    type: 'start',
    title: 'Start',
    config: {},
    position: { x: 0, y: 40 },
  };
  const llm: WorkflowNode = {
    id: createId('node'),
    type: 'llm',
    title: 'Classify',
    config: {
      prompt: 'Return strict JSON: {"decision":"approve"|"reject","reason":"..."}',
      outputMode: 'json',
      outputSchema: '{"type":"object","required":["decision"],"properties":{"decision":{"type":"string"},"reason":{"type":"string"}}}',
      timeoutSecs: '30',
    },
    position: { x: 220, y: 40 },
  };
  const condition: WorkflowNode = {
    id: createId('node'),
    type: 'if',
    title: 'Decision?',
    config: {
      leftValue: '{{previous.output}}',
      operator: 'contains',
      rightValue: 'approve',
    },
    position: { x: 460, y: 40 },
  };
  const approved: WorkflowNode = {
    id: createId('node'),
    type: 'llm',
    title: 'Approved Response',
    config: {
      prompt: 'Write a concise approval summary based on {{node.' + llm.id + '.output}}',
      outputMode: 'text',
    },
    position: { x: 700, y: 0 },
  };
  const rejected: WorkflowNode = {
    id: createId('node'),
    type: 'llm',
    title: 'Rejected Response',
    config: {
      prompt: 'Write a concise rejection summary based on {{node.' + llm.id + '.output}}',
      outputMode: 'text',
    },
    position: { x: 700, y: 120 },
  };

  return {
    id: createId('wf'),
    name,
    description: 'LLM(JSON) -> if -> branch',
    version: 1,
    nodes: [start, llm, condition, approved, rejected],
    edges: [
      { id: createId('edge'), from: start.id, to: llm.id },
      { id: createId('edge'), from: llm.id, to: condition.id },
      { id: createId('edge'), from: condition.id, to: approved.id, branch: 'true' },
      { id: createId('edge'), from: condition.id, to: rejected.id, branch: 'false' },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function createLoopTemplateWorkflow(name = 'Loop Summaries') {
  const now = Date.now();
  const start: WorkflowNode = {
    id: createId('node'),
    type: 'start',
    title: 'Start',
    config: {},
    position: { x: 0, y: 80 },
  };
  const loop: WorkflowNode = {
    id: createId('node'),
    type: 'loop',
    title: 'For Each Item',
    config: {
      mode: 'for_each',
      itemsTemplate: '["alpha","beta","gamma"]',
      maxIterations: '10',
    },
    position: { x: 220, y: 80 },
  };
  const llm: WorkflowNode = {
    id: createId('node'),
    type: 'llm',
    title: 'Summarize Item',
    config: {
      prompt: 'Summarize item {{loop.item}} in one sentence.',
      outputMode: 'text',
    },
    position: { x: 460, y: 20 },
  };
  const done: WorkflowNode = {
    id: createId('node'),
    type: 'llm',
    title: 'Final Summary',
    config: {
      prompt: 'Summarize the overall loop execution.',
      outputMode: 'text',
    },
    position: { x: 460, y: 160 },
  };
  return {
    id: createId('wf'),
    name,
    description: 'loop(for_each) -> llm -> loop / done',
    version: 1,
    nodes: [start, loop, llm, done],
    edges: [
      { id: createId('edge'), from: start.id, to: loop.id },
      { id: createId('edge'), from: loop.id, to: llm.id, branch: 'body' },
      { id: createId('edge'), from: llm.id, to: loop.id },
      { id: createId('edge'), from: loop.id, to: done.id, branch: 'done' },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function createNode(type: WorkflowNode['type']): WorkflowNode {
  const id = createId('node');
  const normalizedType = normalizeWorkflowNodeType(type);
  const definition = getWorkflowNodeType(normalizedType);
  if (definition && !['start', 'shell', 'command', 'llm'].includes(normalizedType)) {
    return {
      id,
      type: normalizedType,
      title: definition.title,
      config: definition.defaultConfig || {
        commandId: definition.commandId,
        inputJson: '{}',
      },
      position: { x: 0, y: 0 },
    };
  }
  if (normalizedType === 'shell') {
    return {
      id,
      type: 'shell',
      title: 'Shell Command',
      config: { command: 'echo hello' },
      position: { x: 0, y: 0 },
    };
  }
  if (normalizedType === 'command') {
    return {
      id,
      type: 'command',
      title: 'Command',
      config: { commandId: 'tool.shell', inputJson: '{ "command": "echo hello" }' },
      position: { x: 0, y: 0 },
    };
  }
  if (normalizedType === 'llm') {
    return {
      id,
      type: 'llm',
      title: 'LLM',
      config: {
        systemPrompt: '',
        prompt: '',
        timeoutSecs: '30',
        outputMode: 'text',
      },
      position: { x: 0, y: 0 },
    };
  }
  return {
    id,
    type: 'start',
    title: 'Start',
    config: {},
    position: { x: 0, y: 0 },
  };
}

export function createSequentialEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push({
      id: createId('edge'),
      from: nodes[index].id,
      to: nodes[index + 1].id,
    });
  }
  return edges;
}

export function getExecutionOrder(workflow: WorkflowDefinition): WorkflowNode[] {
  if (workflow.edges.length === 0) return workflow.nodes;
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const incoming = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge.to]);
  }
  const queue = workflow.nodes.filter((node) => (incoming.get(node.id) || 0) === 0);
  const ordered: WorkflowNode[] = [];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    ordered.push(node);
    for (const next of outgoing.get(node.id) || []) {
      incoming.set(next, (incoming.get(next) || 0) - 1);
      if ((incoming.get(next) || 0) === 0) {
        const nextNode = byId.get(next);
        if (nextNode) queue.push(nextNode);
      }
    }
  }
  return ordered.length === workflow.nodes.length ? ordered : workflow.nodes;
}

export function createRun(workflow: WorkflowDefinition): WorkflowRun {
  const nodeRuns: Record<string, WorkflowNodeRun> = {};
  for (const node of workflow.nodes) {
    nodeRuns[node.id] = {
      nodeId: node.id,
      title: node.title,
      type: normalizeWorkflowNodeType(node.type),
      status: 'pending',
      attempt: 0,
      logs: [],
    };
  }
  return {
    id: createId('run'),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'queued',
    startedAt: Date.now(),
    checkpointVersion: 1,
    variables: {},
    nodeRuns,
    executionStack: [],
  };
}

export function parseInputJson(inputJson?: string): unknown {
  if (!inputJson?.trim()) return {};
  return JSON.parse(inputJson);
}

export function parseMaybeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function formatDate(value?: number) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export function isStarterWorkflow(workflow: WorkflowDefinition) {
  if (workflow.nodes.length !== 2 || workflow.edges.length !== 1) return false;
  const [first, second] = workflow.nodes;
  return (
    normalizeWorkflowNodeType(first?.type || '') === 'start' &&
    normalizeWorkflowNodeType(second?.type || '') === 'llm' &&
    workflow.edges[0]?.from === first.id &&
    workflow.edges[0]?.to === second.id
  );
}

export function exportWorkflow(workflow: WorkflowDefinition): WorkflowExportEnvelope {
  return {
    schema: 'rhythm.workflow.v1',
    exportedAt: Date.now(),
    workflow,
  };
}

export function importWorkflow(value: unknown): WorkflowDefinition {
  const candidate = typeof value === 'object' && value && 'workflow' in value
    ? (value as { workflow?: unknown }).workflow
    : value;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Invalid workflow JSON.');
  }
  const record = candidate as Partial<WorkflowDefinition>;
  if (!record.name || !Array.isArray(record.nodes)) {
    throw new Error('Workflow must include name and nodes.');
  }
  const now = Date.now();
  const nodes = record.nodes.map((node, index) => {
    const item = node as Partial<WorkflowNode>;
    const type = normalizeWorkflowNodeType(String(item.type || 'start'));
    return {
      id: item.id || createId('node'),
      type,
      title: item.title || `${type} ${index + 1}`,
      config: item.config || {},
      position: item.position || { x: index * 180, y: 0 },
    };
  });
  return {
    id: record.id || createId('wf'),
    name: record.name,
    description: record.description,
    version: typeof record.version === 'number' ? record.version : 1,
    nodes,
    edges: Array.isArray(record.edges) ? record.edges : createSequentialEdges(nodes),
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : now,
    updatedAt: now,
  };
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Cannot read file.'));
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || '')));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsText(file);
  });
}

export function renderWorkflowTemplate(template: string, run: { nodeRuns: Record<string, { output?: unknown; logs?: string[] }>; variables?: Record<string, unknown> }) {
  return String(template || '')
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
    .replace(/\{\{\s*node\.([^.}]+)\.logs\s*\}\}/g, (_match, nodeId: string) => run.nodeRuns[nodeId]?.logs?.join('') || '')
    .replace(/\{\{\s*vars\.([^.}]+)\s*\}\}/g, (_match, key: string) => {
      const value = run.variables?.[key];
      return value === undefined ? '' : stringifyTemplateValue(value);
    })
    .replace(/\{\{\s*loop\.index\s*\}\}/g, () => {
      const value = (run.variables?.loop as { index?: unknown } | undefined)?.index;
      return value === undefined ? '' : stringifyTemplateValue(value);
    })
    .replace(/\{\{\s*loop\.iteration\s*\}\}/g, () => {
      const value = (run.variables?.loop as { iteration?: unknown } | undefined)?.iteration;
      return value === undefined ? '' : stringifyTemplateValue(value);
    })
    .replace(/\{\{\s*loop\.item\s*\}\}/g, () => {
      const value = (run.variables?.loop as { item?: unknown } | undefined)?.item;
      return value === undefined ? '' : stringifyTemplateValue(value);
    });
}

export function stringifyTemplateValue(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function templateScalarValue(template: string, run: { nodeRuns: Record<string, { output?: unknown; logs?: string[] }>; variables?: Record<string, unknown> }) {
  const rendered = renderWorkflowTemplate(template, run).trim();
  const parsed = parseMaybeJson(rendered);
  return parsed ?? rendered;
}

export function getOutgoingEdges(workflow: WorkflowDefinition, nodeId: string) {
  return workflow.edges.filter((edge) => edge.from === nodeId);
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
