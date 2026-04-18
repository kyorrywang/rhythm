const { createRuntimeHost } = require('./common.cjs');
const { loadCommandDescriptor } = require('./command_loader.cjs');

const call = JSON.parse(process.env.RHYTHM_PLUGIN_CALL || '{}');
const handler = process.argv[2] || 'runCommand';

async function runCommand() {
  const host = createRuntimeHost(call);
  const descriptor = call.input?.descriptor || loadCommandDescriptor(host.slashCommandsRoot(), call.command);
  if (!descriptor) {
    return { status: 'error', message: `Unknown slash descriptor '${call.command}'` };
  }
  return host.runSkillPromptCommand(descriptor);
}

async function runTool() {
  const host = createRuntimeHost(call);
  return host.runToolCommand(call.command, call.input || {});
}

const handlers = {
  runCommand,
  runTool,
};

(handlers[handler] || runCommand)()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(0);
  })
  .catch((error) => {
    process.stdout.write(`${JSON.stringify({ status: 'error', message: error.message || String(error) })}\n`);
    process.exit(1);
  });
