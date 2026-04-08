const readline = require('node:readline');

const rpc = createRpcClient();

const handlers = {
  gitDiff,
  runValidation,
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const handlerName = process.argv[2];
  const handler = handlers[handlerName];
  if (!handler) throw new Error(`Unknown developer handler '${handlerName || ''}'`);
  const call = JSON.parse(process.env.RHYTHM_PLUGIN_CALL || '{}');
  const result = await handler(call.input || {});
  rpc.close();
  process.stdout.write(JSON.stringify({ ok: true, data: result }));
}

async function gitDiff() {
  return executeHostCommand('tool.shell', {
    command: 'git diff --no-ext-diff --',
  });
}

async function runValidation(input) {
  const command = input.command || '';
  if (!command.trim()) throw new Error("'command' is required");
  const result = await executeHostCommand('tool.shell', { command });
  return {
    ...result,
    issues: parseIssues(`${result.stdout || ''}\n${result.stderr || ''}`),
  };
}

function parseIssues(text) {
  const issues = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^(.+?):(\d+):(\d+):\s*(.+)$/) || line.match(/^(.+?)\((\d+),(\d+)\):\s*(.+)$/);
    if (!match) continue;
    issues.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      message: match[4],
    });
  }
  return issues;
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
    } catch (_error) {
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
