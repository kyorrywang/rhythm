# Plugin TODO

## Plugin Host

- Current state: runtime selection prefers `dev.main` in development and `main` in production/external mode.
- Current state: plugin manifest validation exists via `npm run validate:plugins`.
- Current state: plugin ecosystem page supports local install, refresh, enable/disable, uninstall, permissions, and diagnostics.
- Current state: local install previews manifest metadata, permissions, dependency summary, destination path, overwrite status, and warnings before copying files.
- Current state: uninstall asks whether plugin storage should be kept or deleted.
- Current state: settings page supports core settings, plugin settings aggregation, search, and overview.
- Current state: UI commands declared in manifest but missing runtime handlers report plugin/entry/handler details.
- Current state: deprecated `ctx.workspace.listDir`, `ctx.workspace.readTextFile`, and `ctx.shell.run` are no longer exposed by SDK or host context.
- Dist policy: current repository keeps official plugin `dist/main.js` files checked in so local plugin validation and dev-mode fallback both have a concrete formal entry.
- Add archive storage strategy for uninstall if users need reversible cleanup.

## Plugin Build

- Keep `npm run typecheck:plugins` as the plugin-only TypeScript check.
- Keep `npm run build:plugins` as the plugin-only build command.
- Current rule: `main` must be `dist/main.js`, and `dev.main` must be `src/main.tsx`.
- Current dist policy: official plugin `dist/` files are checked in for now.
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

## Workflow Plugin

- Current state: Workflow plugin exists with panel, graph editor, run view, node inspector, and settings.
- Current state: first node types are `manual`, `shell`, and `command`.
- Current state: Workflow runtime uses a node executor registry; runtime schedules nodes but does not branch on concrete node types.
- Current state: Workflow includes an `workflow.llm` node that calls `core.llm.complete` through `ctx.commands.execute(...)`.
- Current state: shell nodes use `ctx.commands.start('tool.shell', ...)` for streaming output and cancellation.
- Current state: command nodes can call any available `ctx.commands.execute(...)` command.
- Current state: Agent-facing workflow tools can execute shell, command-backed, and LLM nodes through the backend plugin runtime host command bridge.
- Current state: workflow settings support run history, max history, auto-open run view, and continue-on-error behavior.
- Current state: Workflow editor supports JSON import/export.
- Current state: Workflow graph editor uses a lightweight built-in SVG canvas with draggable nodes and manual edge add/remove.
- Current state: Workflow defines a plugin-level node type extension point through `workflow.registerNodeType` and `workflow.nodeType.register`.
- Current state: Developer contributes `developer.validation` and `developer.gitDiff` workflow node types without requiring core changes.
- Current state: Agent-facing workflow tools `workflow.create`, `workflow.run`, and `workflow.getStatus` exist for the backend run path.
- Consider a richer graph canvas library if zoom, minimap, ports/handles, or large graph performance become necessary.
- Command-backed contributed nodes must point at commands that are executable from the backend runtime, or the provider plugin must also supply a backend command implementation.

## Shell Streaming And Cancel

- Current state: shell streaming and cancel are implemented through `ctx.commands.start(...)` and backend plugin command runs.
- Remaining polish:
  - improve process-tree cleanup on Windows
  - decide whether completed/cancelled runs should persist richer diagnostics
  - consider whether `tool.shell` one-shot should internally reuse the streaming path
