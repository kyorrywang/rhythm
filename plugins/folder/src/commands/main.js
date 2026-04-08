const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const handlers = {
  readPreview,
  createDir,
  rename,
  deletePath,
  reveal,
};

const MAX_TEXT_PREVIEW_BYTES = 1_048_576;

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

async function readPreview(input, call) {
  if (!input.path) throw new Error("'path' is required");
  const cwd = workspaceCwd(call);
  const target = resolveInsideWorkspace(cwd, input.path);
  const stats = await fs.stat(target);
  if (!stats.isFile()) {
    throw new Error(`'${input.path}' is not a file`);
  }

  const limitBytes = MAX_TEXT_PREVIEW_BYTES;
  const size = stats.size;
  const truncated = size > limitBytes;
  const handle = await fs.open(target, 'r');

  try {
    const buffer = Buffer.alloc(Math.min(size, limitBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const preview = buffer.subarray(0, bytesRead);
    const isBinary = preview.includes(0);

    if (isBinary) {
      return {
        path: toRelativePath(cwd, target),
        content: null,
        size,
        truncated,
        is_binary: true,
        encoding_error: null,
        limit_bytes: limitBytes,
      };
    }

    try {
      return {
        path: toRelativePath(cwd, target),
        content: preview.toString('utf8'),
        size,
        truncated,
        is_binary: false,
        encoding_error: null,
        limit_bytes: limitBytes,
      };
    } catch (error) {
      return {
        path: toRelativePath(cwd, target),
        content: null,
        size,
        truncated,
        is_binary: false,
        encoding_error: error instanceof Error ? error.message : String(error),
        limit_bytes: limitBytes,
      };
    }
  } finally {
    await handle.close();
  }
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
