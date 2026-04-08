# Rhythm Plugin Template

Use this template as the starting point for a local JS UI plugin.

## Rules

- Import from `src/plugin/sdk`, not `src/plugin/host`.
- Keep manifest `main` as `dist/main.js`.
- Keep manifest `dev.main` as `src/main.tsx`.
- Use `ctx.commands.execute(...)` for shared commands and built-in tools.
- Do not use deprecated `ctx.workspace.*` or `ctx.shell.run(...)`.
- If a backend Node/Python command needs host capabilities, call the host through the runtime RPC helper instead of importing app internals.

## Useful Commands

```bash
npm run validate:plugins
npm run typecheck:plugins
npm run build:plugins
```

## Reference

- [SDK Guide](/C:/Users/Administrator/Documents/dev/rhythm/docs/PLUGIN_SDK.md)
- [Plugin Architecture](/C:/Users/Administrator/Documents/dev/rhythm/docs/PLUGIN_ARCHITECTURE.md)

## Optional Backend Command Examples

This template includes optional backend command helpers:

- `src/commands/main.js`
- `src/commands/runtimeRpc.js`
- `src/commands/main.py`
- `src/commands/runtime_rpc.py`

These examples show how a Node or Python runtime command can call host commands such as `tool.shell` through the plugin runtime bridge. They are not wired into `plugin.template.json` by default; add a `contributes.commands` entry with `implementation`, `entry`, and `handler` when you need one.
