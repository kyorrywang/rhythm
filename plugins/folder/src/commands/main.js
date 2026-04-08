const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const handlers = {
  createDir,
  rename,
  deletePath,
  reveal,
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const handlerName = process.argv[2];
  const handler = handlers[handlerName];
  if (!handler) {
    throw new Error(`Unknown folder handler '${handlerName || ''}'`);
  }
  const call = JSON.parse(process.env.RHYTHM_PLUGIN_CALL || '{}');
  const result = await handler(call.input || {}, call);
  process.stdout.write(JSON.stringify(result));
}

async function createDir(input, call) {
  if (!input.path) throw new Error("'path' is required");
  const cwd = workspaceCwd(call);
  const target = resolveInsideWorkspace(cwd, input.path);
  await fs.mkdir(target, { recursive: true });
  return { path: toRelativePath(cwd, target) };
}

async function rename(input, call) {
  if (!input.from) throw new Error("'from' is required");
  if (!input.to) throw new Error("'to' is required");
  const cwd = workspaceCwd(call);
  const from = resolveInsideWorkspace(cwd, input.from);
  const to = resolveInsideWorkspace(cwd, input.to);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
  return {
    from: toRelativePath(cwd, from),
    to: toRelativePath(cwd, to),
  };
}

async function reveal(input, call) {
  if (!input.path) throw new Error("'path' is required");
  const cwd = workspaceCwd(call);
  const target = resolveInsideWorkspace(cwd, input.path);
  if (!fsSync.existsSync(target)) {
    throw new Error(`Path does not exist: ${input.path}`);
  }
  if (process.platform === 'win32') {
    await spawnDetached('explorer.exe', ['/select,', target]);
  } else if (process.platform === 'darwin') {
    await spawnDetached('open', ['-R', target]);
  } else {
    await spawnDetached('xdg-open', [path.dirname(target)]);
  }
  return { path: toRelativePath(cwd, target) };
}

async function deletePath(input, call) {
  if (!input.path) throw new Error("'path' is required");
  const cwd = workspaceCwd(call);
  const target = resolveInsideWorkspace(cwd, input.path);
  await fs.rm(target, {
    recursive: !!input.recursive,
    force: false,
  });
  return { path: toRelativePath(cwd, target) };
}

function workspaceCwd(call) {
  const cwd = call?.context?.cwd;
  if (!cwd) throw new Error('Missing workspace cwd.');
  return path.resolve(cwd);
}

function resolveInsideWorkspace(cwd, requestedPath) {
  const target = path.resolve(cwd, requestedPath || '.');
  const relative = path.relative(cwd, target);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return target;
  }
  throw new Error(`Path escapes workspace: ${requestedPath}`);
}

function toRelativePath(cwd, absolutePath) {
  const relative = path.relative(cwd, absolutePath);
  return relative ? relative.split(path.sep).join('/') : '.';
}

function spawnDetached(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
