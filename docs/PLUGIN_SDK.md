# Rhythm Plugin SDK

This document is the plugin-author guide for the current SDK surface.

## Stable Import Rule

Plugins should import only from:

```ts
import { definePlugin } from '../../../src/plugin/sdk';
```

Do not import from `src/plugin/host`.

## Recommended Structure

```text
plugins/my-plugin/
  plugin.json
  src/
    main.tsx
    commands.ts
    components/
  dist/
    main.js
```

Manifest rule:

- `main` must be `dist/main.js`
- `dev.main` must be `src/main.tsx`

## Minimal Example

```ts
import { definePlugin, type LeftPanelProps, type WorkbenchProps } from '../../../src/plugin/sdk';

interface ExamplePayload {
  message: string;
}

export default definePlugin({
  activate(ctx) {
    ctx.commands.register(
      'my-plugin.hello',
      () => ({ message: 'Hello from a Rhythm plugin.' }),
      {
        title: 'Hello',
        description: 'Return a simple greeting.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    );

    ctx.ui.activityBar.register({
      id: 'my-plugin.activity',
      title: 'My Plugin',
      icon: 'box',
      opens: 'my-plugin.panel',
    });

    ctx.ui.leftPanel.register({
      id: 'my-plugin.panel',
      title: 'My Plugin',
      component: ExamplePanel,
    });

    ctx.ui.workbench.register<ExamplePayload>({
      id: 'my-plugin.preview',
      title: 'My Plugin Preview',
      component: ExampleWorkbench,
    });
  },
});

function ExamplePanel({ ctx, width }: LeftPanelProps) {
  return (
    <div style={{ width }}>
      <button
        onClick={() =>
          ctx.ui.workbench.open({
            viewId: 'my-plugin.preview',
            title: 'My Plugin',
            payload: { message: 'Opened from the left panel.' },
          })
        }
      >
        Open Workbench
      </button>
    </div>
  );
}

function ExampleWorkbench({ payload }: WorkbenchProps<ExamplePayload>) {
  return <div>{payload.message}</div>;
}
```

## Plugin Context

Current stable context:

- `ctx.commands`
- `ctx.ui`
- `ctx.storage`
- `ctx.events`
- `ctx.tasks`
- `ctx.permissions`

### Commands

Use one command entry point:

```ts
await ctx.commands.execute('tool.read_file', { path: 'README.md' });
await ctx.commands.execute('tool.shell', { command: 'git status --short' });
await ctx.commands.execute('folder.openFile', { path: 'src/App.tsx', line: 12, column: 4 });
```

For long-running commands such as `tool.shell`, use streaming:

```ts
const running = await ctx.commands.start(
  'tool.shell',
  { command: 'npm run build' },
  (event) => {
    if (event.type === 'stdout') console.log(event.chunk);
    if (event.type === 'stderr') console.error(event.chunk);
  },
);

const result = await running.result;
```

You can also register UI-side commands:

```ts
ctx.commands.register(
  'my-plugin.refresh',
  async () => {
    return { ok: true };
  },
  {
    title: 'Refresh',
    description: 'Refresh plugin state.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
);
```

### UI Registries

Current UI slots:

- `ctx.ui.activityBar.register(...)`
- `ctx.ui.leftPanel.register(...)`
- `ctx.ui.workbench.register(...)`
- `ctx.ui.settings.register(...)`
- `ctx.ui.messageActions.register(...)`
- `ctx.ui.toolResultActions.register(...)`

### Storage

Use plugin-scoped storage:

```ts
await ctx.storage.set('recent', ['a', 'b']);
const recent = await ctx.storage.get<string[]>('recent');
```

File-like plugin storage is also available:

```ts
await ctx.storage.files.writeText('cache/state.json', JSON.stringify({ ok: true }));
const text = await ctx.storage.files.readText('cache/state.json');
```

### Events

Use events for cross-plugin coordination:

```ts
ctx.events.emit('developer.gitStatusChanged', { files: [] });

const disposable = ctx.events.on('developer.gitStatusChanged', (payload) => {
  console.log(payload);
});
```

### Tasks

Use tasks for long-running plugin-side flows:

```ts
const task = ctx.tasks.start({ title: 'Refreshing data' });
ctx.tasks.update(task.id, { detail: 'Halfway done' });
ctx.tasks.complete(task.id, 'Finished');
```

## Manifest Notes

Current manifest sections:

- `requires.plugins`
- `requires.commands`
- `requires.tools`
- `contributes.commands`
- `contributes.views`
- `contributes.tools`
- `contributes.settings`
- `contributes.skills`
- `contributes.menus`

### UI Command Example

```json
{
  "id": "my-plugin.hello",
  "description": "Return a simple greeting.",
  "parameters": {
    "type": "object",
    "properties": {}
  },
  "implementation": "ui",
  "entry": "dist/main.js",
  "handler": "my-plugin.hello"
}
```

### Tool-backed Command Example

```json
{
  "id": "folder.read",
  "description": "Read a file through a tool wrapper.",
  "parameters": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    },
    "required": ["path"]
  },
  "tool": "folder.read"
}
```

### Runtime Command Example

```json
{
  "id": "folder.rename",
  "description": "Rename or move a file or folder.",
  "parameters": {
    "type": "object",
    "properties": {
      "from": { "type": "string" },
      "to": { "type": "string" }
    },
    "required": ["from", "to"]
  },
  "implementation": "node",
  "entry": "src/commands/main.js",
  "handler": "rename"
}
```

## Deprecated APIs

Do not use:

- `ctx.workspace.*`
- `ctx.shell.run(...)`

Use `ctx.commands.execute(...)` instead.

## Current Checks

Plugin-focused checks:

```bash
npm run validate:plugins
npm run typecheck:plugins
npm run build:plugins
```

The validator currently rejects:

- imports from `src/plugin/host`
- deprecated `ctx.workspace`
- deprecated `ctx.shell`
- invalid `main` / `dev.main`

## Template

Start from:

- [plugin.template.json](/C:/Users/Administrator/Documents/dev/rhythm/plugins/_template/plugin.template.json)
- [main.tsx](/C:/Users/Administrator/Documents/dev/rhythm/plugins/_template/src/main.tsx)
