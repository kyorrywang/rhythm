# Rhythm Plugin Template

Use this template as the starting point for a local JS UI plugin.

## Rules

- Import from `src/plugin/sdk`, not `src/plugin/host`.
- Keep manifest `main` as `dist/main.js`.
- Keep manifest `dev.main` as `src/main.tsx`.
- Use `ctx.commands.execute(...)` for shared commands and built-in tools.
- Do not use deprecated `ctx.workspace.*` or `ctx.shell.run(...)`.

## Useful Commands

```bash
npm run validate:plugins
npm run typecheck:plugins
npm run build:plugins
```

## Reference

- [SDK Guide](/C:/Users/Administrator/Documents/dev/rhythm/docs/PLUGIN_SDK.md)
- [Plugin Architecture](/C:/Users/Administrator/Documents/dev/rhythm/docs/PLUGIN_ARCHITECTURE.md)
