const { createRuntimeRpcClient } = require('./runtimeRpc');

const rpc = createRuntimeRpcClient();

const handlers = {
  hello,
  shellEcho,
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const handlerName = process.argv[2];
  const handler = handlers[handlerName];
  if (!handler) throw new Error(`Unknown handler '${handlerName || ''}'`);

  const call = JSON.parse(process.env.RHYTHM_PLUGIN_CALL || '{}');
  const result = await handler(call.input || {}, call);
  rpc.close();
  process.stdout.write(JSON.stringify({ ok: true, data: result }));
}

async function hello(input) {
  return { message: input.message || 'Hello from a backend command.' };
}

async function shellEcho(input) {
  return rpc.executeCommand('tool.shell', {
    command: `echo ${JSON.stringify(input.message || 'hello')}`,
  });
}
