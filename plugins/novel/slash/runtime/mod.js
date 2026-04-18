const path = require('path');
const { createRuntimeHost } = require('./common');
const { loadCommandDescriptor, resolveHandlerModule } = require('./command_loader');

const call = JSON.parse(process.env.RHYTHM_PLUGIN_CALL || '{}');

async function runCommand() {
  const host = createRuntimeHost(call);
  const slashRoot = path.join(__dirname, '..');
  const descriptor = call.input?.descriptor || loadCommandDescriptor(slashRoot, call.command);
  if (!descriptor) {
    return { status: 'error', message: `Unknown slash descriptor '${call.command}'` };
  }

  const handler = resolveHandlerModule(__dirname, descriptor.handler?.id || descriptor.entry?.id);
  if (!handler || typeof handler.run !== 'function') {
    return { status: 'error', message: `Missing handler '${descriptor.handler?.id}'` };
  }

  return handler.run(host, descriptor);
}

runCommand()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(0);
  })
  .catch((error) => {
    process.stdout.write(`${JSON.stringify({ status: 'error', message: error.message || String(error) })}\n`);
    process.exit(1);
  });
