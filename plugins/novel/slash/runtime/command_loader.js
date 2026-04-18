const fs = require('fs');
const path = require('path');

function loadCommandDescriptor(slashRoot, commandName) {
  const commandsDir = path.join(slashRoot, 'commands');
  const files = fs.readdirSync(commandsDir).filter((file) => file.endsWith('.json'));
  for (const file of files) {
    const descriptor = JSON.parse(fs.readFileSync(path.join(commandsDir, file), 'utf8'));
    if (descriptor.name === commandName) {
      return descriptor;
    }
  }
  return null;
}

function resolveHandlerModule(runtimeRoot, handlerId) {
  return require(path.join(runtimeRoot, 'handlers', `${handlerId}.js`));
}

module.exports = {
  loadCommandDescriptor,
  resolveHandlerModule,
};
