import type { WorkflowDefinition, WorkflowEdge, WorkflowExportEnvelope, WorkflowNode, WorkflowNodeRun, WorkflowRun } from './types';
import { getWorkflowNodeType } from './nodeRegistry';

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultWorkflow(name = 'Untitled Workflow'): WorkflowDefinition {
  const now = Date.now();
  const manual: WorkflowNode = {
    id: createId('node'),
    type: 'manual',
    title: 'Start',
    config: {},
    position: { x: 0, y: 0 },
  };
  const shell: WorkflowNode = {
    id: createId('node'),
    type: 'shell',
    title: 'Run Command',
    config: { command: 'echo "hello from workflow"' },
    position: { x: 220, y: 0 },
  };
  return {
    id: createId('wf'),
    name,
    description: 'Start with a trigger, then run a command or add more nodes.',
    version: 1,
    nodes: [manual, shell],
    edges: [{ id: createId('edge'), from: manual.id, to: shell.id }],
    createdAt: now,
    updatedAt: now,
  };
}

export function createNode(type: WorkflowNode['type']): WorkflowNode {
  const id = createId('node');
  const definition = getWorkflowNodeType(type);
  if (definition && !['manual', 'shell', 'command'].includes(type)) {
    return {
      id,
      type,
      title: definition.title,
      config: definition.defaultConfig || {
        commandId: definition.commandId,
        inputJson: '{}',
      },
      position: { x: 0, y: 0 },
    };
  }
  if (type === 'shell') {
    return {
      id,
      type,
      title: 'Shell Command',
      config: { command: 'echo hello' },
      position: { x: 0, y: 0 },
    };
  }
  if (type === 'command') {
    return {
      id,
      type,
      title: 'Command',
      config: { commandId: 'tool.shell', inputJson: '{ "command": "echo hello" }' },
      position: { x: 0, y: 0 },
    };
  }
  return {
    id,
    type,
    title: 'Manual Trigger',
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
      type: node.type,
      status: 'pending',
      logs: [],
    };
  }
  return {
    id: createId('run'),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'queued',
    startedAt: Date.now(),
    nodeRuns,
  };
}

export function parseInputJson(inputJson?: string): unknown {
  if (!inputJson?.trim()) return {};
  return JSON.parse(inputJson);
}

export function formatDate(value?: number) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export function isStarterWorkflow(workflow: WorkflowDefinition) {
  if (workflow.nodes.length !== 2 || workflow.edges.length !== 1) return false;
  const [first, second] = workflow.nodes;
  return (
    first?.type === 'manual' &&
    second?.type === 'shell' &&
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
    const type = item.type === 'shell' || item.type === 'command' || item.type === 'manual'
      ? item.type
      : 'manual';
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
