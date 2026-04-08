# Plugin TODO

## Plugin Host

- Current state: runtime selection prefers `dev.main` in development and `main` in production/external mode.
- Current state: plugin manifest validation exists via `npm run validate:plugins`.
- Current state: plugin ecosystem page supports local install, refresh, enable/disable, uninstall, permissions, and diagnostics.
- Current state: settings page supports core settings, plugin settings aggregation, search, and overview.
- Define the final rule for whether plugin `dist/` files are checked in or treated as generated artifacts.
- Add a clearer runtime diagnostic when a UI command is declared but no handler is registered.
- Remove or hide deprecated `ctx.workspace.listDir`, `ctx.workspace.readTextFile`, and `ctx.shell.run` after all plugins migrate to `ctx.commands.execute(...)`.

## Plugin Build

- Keep `npm run typecheck:plugins` as the plugin-only TypeScript check.
- Keep `npm run build:plugins` as the plugin-only build command.
- Current rule: `main` must be `dist/main.js`, and `dev.main` must be `src/main.tsx`.
- Consider extracting shared host SDK/UI imports so plugin bundles do not duplicate shared code.
- Decide whether each plugin should eventually own a local package/build config or continue using the repo-level build script.

## Developer Plugin Settings

- Current state: Developer settings section exists.
- Current state: validation presets are configurable.
- Current state: auto-refresh git status is configurable.
- Current state: changed file badge sync is configurable.
- Allow users to configure command timeout/output limit after shell streaming support exists.

## Developer Plugin Diff

- Current state: diff supports file filtering, file navigation, and hunk collapse/expand.
- Add side-by-side diff display.
- Do not add hunk accept/reject until patch transaction, write permissions, and rollback strategy are designed.

## Developer Plugin Validation

- Current state: issue parsing and `folder.openFile(path,line,column)` integration.
- Current state: validation preset detection reads `package.json` scripts.
- Current state: presets are classified as typecheck/build/test/lint/custom.
- Current state: validation history supports filtering and clear.

## Developer Plugin Git

- Current state: status, unstaged diff, staged diff, file diff, stage, unstage, commit.
- Current state: status parsing covers rename/conflict states.
- Current state: commit draft is persisted in the panel.
- Current state: changed files are grouped into staged/unstaged sections.

## Developer Plugin Agent/Chat Integration

- Current state:
  - shell tool result action opens Developer log.
  - message actions can open latest diff and latest validation.
- Current state: message action can open latest task summary.
- Consider exposing a message action for "Open changed files" after Folder supports richer selection/highlighting.

## Folder Plugin Integration

- Current state:
  - `folder.openFile(path,line,column)` opens the file preview and highlights a target line.
  - Folder listens for `developer.gitStatusChanged` and shows git status badges.
- Add a richer file preview model before adding navigation beyond a highlighted line.
- Consider a file selection/highlight command for cross-plugin coordination.

## Shell Streaming And Cancel

- Current state: shell streaming and cancel are implemented through `ctx.commands.start(...)` and backend plugin command runs.
- Remaining polish:
  - improve process-tree cleanup on Windows
  - decide whether completed/cancelled runs should persist richer diagnostics
  - consider whether `tool.shell` one-shot should internally reuse the streaming path
