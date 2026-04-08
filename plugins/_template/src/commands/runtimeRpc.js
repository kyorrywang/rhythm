const readline = require('node:readline');

function createRuntimeRpcClient() {
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
    executeCommand(commandId, input) {
      const id = `rpc_${Date.now().toString(36)}_${nextId++}`;
      process.stdout.write(JSON.stringify({
        id,
        method: 'command.execute',
        params: { commandId, input },
      }) + '\n');
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      rl.close();
    },
  };
}

module.exports = { createRuntimeRpcClient };
