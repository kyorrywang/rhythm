const { createRuntimeHost } = require('./common.cjs');
const { loadCommandDescriptor } = require('./command_loader.cjs');

const call = JSON.parse(process.env.RHYTHM_PLUGIN_CALL || '{}');

async function runCommand() {
  const host = createRuntimeHost(call);
  const descriptor = call.input?.descriptor || loadCommandDescriptor(host.slashCommandsRoot(), call.command);
  if (!descriptor) {
    return { status: 'error', message: `Unknown slash descriptor '${call.command}'` };
  }
  return host.runSkillPromptCommand(descriptor);
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
