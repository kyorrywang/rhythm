const fs = require('fs');
const path = require('path');

function loadCommandDescriptor(commandsDir, commandName) {
  const files = fs.readdirSync(commandsDir).filter((file) => file.endsWith('.json'));
  for (const file of files) {
    const descriptor = JSON.parse(fs.readFileSync(path.join(commandsDir, file), 'utf8'));
    if (descriptor.name === commandName) {
      return descriptor;
    }
  }
  return null;
}

module.exports = {
  loadCommandDescriptor,
};
