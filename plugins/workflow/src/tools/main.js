const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');

const rpc = createRpcClient();

const handlers = {
  create,
  run,
  getStatus,
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const handlerName = process.argv[2];
  const handler = handlers[handlerName];
  if (!handler) {
    throw new Error(`Unknown workflow handler '${handlerName || ''}'`);
  }
  const call = JSON.parse(process.env.RHYTHM_PLUGIN_CALL || '{}');
  const result = await handler(call.input || {}, call);
  rpc.close();
  process.stdout.write(JSON.stringify({ ok: true, data: result }));
}

async function create(input, call) {
  const workflow = createDefaultWorkflow(input.name || 'Agent Workflow');
  const definitions = await readJson(call, 'definitions.json', []);
  await writeJson(call, 'definitions.json', [workflow, ...definitions]);
  return workflow;
}

async function run(input, call) {
  if (!input.workflowId) throw new Error("'workflowId' is required");
  const definitions = await readJson(call, 'definitions.json', []);
  const workflow = definitions.find((item) => item.id === input.workflowId);
  if (!workflow) throw new Error(`Workflow not found: ${input.workflowId}`);
  const run = createRun(workflow);
  run.status = 'running';
  await saveRun(call, run);
  let hasError = false;
  for (const node of getExecutionOrder(workflow)) {
    const nodeRun = run.nodeRuns[node.id];
    nodeRun.status = 'running';
    nodeRun.startedAt = Date.now();
    await saveRun(call, run);
    try {
      if (node.type === 'manual') {
        nodeRun.output = { triggered: true };
      } else if (node.type === 'shell') {
        const command = node.config?.command || '';
        if (!command.trim()) throw new Error(`${node.title} missing shell command`);
        nodeRun.input = { command };
        nodeRun.output = await executeHostCommand('tool.shell', { command });
        const output = nodeRun.output || {};
        nodeRun.logs.push(String(output.stdout || ''));
        if (output.stderr) nodeRun.logs.push(String(output.stderr));
      } else if (node.type === 'command') {
        const commandId = node.config?.commandId || '';
        if (!commandId.trim()) throw new Error(`${node.title} missing command id`);
        const commandInput = parseInputJson(node.config?.inputJson);
        nodeRun.input = commandInput;
        nodeRun.output = await executeHostCommand(commandId, commandInput);
      } else if (node.type === 'workflow.llm') {
        const input = {
          prompt: renderWorkflowTemplate(node.config?.prompt || '', run),
          systemPrompt: renderWorkflowTemplate(node.config?.systemPrompt || '', run),
          providerId: node.config?.providerId || undefined,
          model: node.config?.model || undefined,
          timeoutSecs: node.config?.timeoutSecs ? Number(node.config.timeoutSecs) : undefined,
        };
        nodeRun.input = input;
        nodeRun.output = await executeHostCommand('core.llm.complete', input);
      } else if (node.config?.commandId) {
        const commandInput = parseInputJson(node.config?.inputJson);
        nodeRun.input = commandInput;
        nodeRun.output = await executeHostCommand(node.config.commandId, commandInput);
      } else {
        throw new Error(`${node.title} has no command-backed implementation`);
      }
      nodeRun.status = 'success';
    } catch (error) {
      hasError = true;
      nodeRun.status = 'error';
      nodeRun.error = error instanceof Error ? error.message : String(error);
      break;
    } finally {
      nodeRun.endedAt = Date.now();
      await saveRun(call, run);
    }
  }
  run.status = hasError ? 'error' : 'success';
  run.endedAt = Date.now();
  await saveRun(call, run);
  return run;
}

async function getStatus(input, call) {
  if (!input.runId) throw new Error("'runId' is required");
  const runs = await readJson(call, 'runs.json', []);
  return runs.find((run) => run.id === input.runId) || null;
}

async function readJson(call, file, fallback) {
  try {
    const text = await fs.readFile(storageFile(call, file), 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(call, file, value) {
  const target = storageFile(call, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value, null, 2), 'utf8');
}

async function saveRun(call, run) {
  const runs = await readJson(call, 'runs.json', []);
  const next = runs.some((item) => item.id === run.id)
    ? runs.map((item) => (item.id === run.id ? run : item))
    : [run, ...runs];
  await writeJson(call, 'runs.json', next.slice(0, 20));
}

function createDefaultWorkflow(name) {
  const now = Date.now();
  const manual = {
    id: createId('node'),
    type: 'manual',
    title: 'Manual Trigger',
    config: {},
    position: { x: 0, y: 0 },
  };
  const shell = {
    id: createId('node'),
    type: 'shell',
    title: 'Echo Hello',
    config: { command: 'echo hello from workflow' },
    position: { x: 180, y: 0 },
  };
  return {
    id: createId('wf'),
    name,
    version: 1,
    nodes: [manual, shell],
    edges: [{ id: createId('edge'), from: manual.id, to: shell.id }],
    createdAt: now,
    updatedAt: now,
  };
}

function createRun(workflow) {
  const nodeRuns = {};
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

function getExecutionOrder(workflow) {
  if (!workflow.edges || workflow.edges.length === 0) return workflow.nodes;
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const incoming = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map();
  for (const edge of workflow.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge.to]);
  }
  const queue = workflow.nodes.filter((node) => (incoming.get(node.id) || 0) === 0);
  const ordered = [];
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

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function workspaceCwd(call) {
  const cwd = call?.context?.cwd;
  if (!cwd) throw new Error('Missing workspace cwd.');
  return path.resolve(cwd);
}

function parseInputJson(inputJson) {
  if (!inputJson || !String(inputJson).trim()) return {};
  return JSON.parse(inputJson);
}

function renderWorkflowTemplate(template, run) {
  return String(template || '')
    .replace(/\{\{\s*previous\.output\s*\}\}/g, () => {
      const previous = findPreviousNodeRun(run, (nodeRun) => nodeRun.output !== undefined);
      return previous?.output === undefined ? '' : stringifyTemplateValue(previous.output);
    })
    .replace(/\{\{\s*previous\.logs\s*\}\}/g, () => {
      const previous = findPreviousNodeRun(run, (nodeRun) => nodeRun.logs && nodeRun.logs.length > 0);
      return previous?.logs?.join('') || '';
    })
    .replace(/\{\{\s*node\.([^.}]+)\.output\s*\}\}/g, (_match, nodeId) => {
      const value = run.nodeRuns[nodeId]?.output;
      return value === undefined ? '' : stringifyTemplateValue(value);
    })
    .replace(/\{\{\s*node\.([^.}]+)\.logs\s*\}\}/g, (_match, nodeId) => run.nodeRuns[nodeId]?.logs?.join('') || '');
}

function findPreviousNodeRun(run, predicate) {
  const nodeRuns = Object.values(run.nodeRuns);
  for (let index = nodeRuns.length - 1; index >= 0; index -= 1) {
    if (predicate(nodeRuns[index])) return nodeRuns[index];
  }
  return undefined;
}

function stringifyTemplateValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function executeHostCommand(commandId, input) {
  return rpc.request('command.execute', { commandId, input });
}

function createRpcClient() {
  let nextId = 0;
  const pending = new Map();
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok === false) {
      request.reject(new Error(message.error?.message || 'Host command failed'));
    } else {
      request.resolve(message.data);
    }
  });

  return {
    request(method, params) {
      const id = `rpc_${Date.now().toString(36)}_${nextId++}`;
      process.stdout.write(JSON.stringify({ id, method, params }) + '\n');
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      rl.close();
    },
  };
}

function storageFile(call, file) {
  const storagePath = call?.context?.plugin_storage_path;
  if (!storagePath) throw new Error('Missing plugin storage path.');
  const base = path.resolve(storagePath);
  const target = path.resolve(base, file);
  const relative = path.relative(base, target);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return target;
  }
  throw new Error(`Path escapes plugin storage: ${file}`);
}
