# Plugin TODO

## Plugin Host

- Make runtime selection explicit: prefer `dev.main` during development and `main` for production/external plugins.
- Decide whether legacy `entry` fallback should be removed after all local plugins use `main`.
- Define the final rule for whether plugin `dist/` files are checked in or treated as generated artifacts.
- Add manifest validation for UI commands:
  - `implementation`
  - `entry`
  - `handler`
  - `parameters`
- Add a clearer runtime diagnostic when a UI command is declared but no handler is registered.

## Plugin Build

- Keep `npm run typecheck:plugins` as the plugin-only TypeScript check.
- Keep `npm run build:plugins` as the plugin-only build command.
- Consider extracting shared host SDK/UI imports so plugin bundles do not duplicate shared code.
- Decide whether each plugin should eventually own a local package/build config or continue using the repo-level build script.

## Developer Plugin Settings

- Add a Developer settings section.
- Allow users to configure validation presets.
- Allow users to configure command timeout/output limit after shell streaming support exists.
- Add an auto-refresh option for git status.
- Add a setting for whether changed files should update Folder file badges automatically.

## Developer Plugin Diff

- Current state: raw diff with file filtering and hunk collapse/expand.
- Add file navigation within the diff view.
- Add side-by-side diff display.
- Do not add hunk accept/reject until patch transaction, write permissions, and rollback strategy are designed.

## Developer Plugin Validation

- Current state: issue parsing and `folder.openFile(path,line,column)` integration.
- Improve validation preset detection by reading `package.json` scripts.
- Classify presets as typecheck/build/test/lint.
- Add validation history filtering/clear action if the list becomes noisy.

## Developer Plugin Git

- Current state: status, unstaged diff, staged diff, file diff, stage, unstage, commit.
- Improve status parsing for rename/conflict states.
- Add commit draft persistence instead of using `window.prompt`.
- Consider staged/unstaged grouped changed-file sections.

## Developer Plugin Agent/Chat Integration

- Current state:
  - shell tool result action opens Developer log.
  - message actions can open latest diff and latest validation.
- Add a task summary view after the command/diff/validation model stabilizes.
- Consider exposing a message action for "Open changed files" after Folder supports richer selection/highlighting.

## Folder Plugin Integration

- Current state:
  - `folder.openFile(path,line,column)` opens the file preview and highlights a target line.
  - Folder listens for `developer.gitStatusChanged` and shows git status badges.
- Add a richer file preview model before adding navigation beyond a highlighted line.
- Consider a file selection/highlight command for cross-plugin coordination.

## Shell Streaming And Cancel

### Goal

Support long-running shell commands with streaming stdout/stderr, cancellation, and reliable task state so Developer can show live logs instead of waiting for `tool.shell` to return.

### Why This Is Core Work

This cannot be implemented safely inside the Developer plugin alone. The shell process is owned by the backend tool runtime, so cancellation, process lifecycle, output limits, and permission enforcement must live in the shared command/tool host.

### Proposed Scope

- Add a long-running command API, for example `ctx.commands.start(...)`, while keeping `ctx.commands.execute(...)` for one-shot commands.
- Return a `runId` / task handle from shell start.
- Stream output events:
  - `command.output`
  - `command.stderr`
  - `command.completed`
  - `command.failed`
  - `command.cancelled`
- Add backend cancellation by `runId`.
- Preserve permission checks for `terminal.run`.
- Preserve output limits and timeout policy.
- Persist command summary after completion, not every streamed chunk.

### Backend Tasks

- Introduce a shell process registry keyed by `runId`.
- Add command/tool event emission for stdout/stderr chunks.
- Add cancellation command that kills the process tree when possible.
- Add timeout handling that reports `timed_out`.
- Ensure process cleanup on app shutdown/session end.
- Keep the current `tool.shell` one-shot API as a compatibility wrapper.

### Frontend/Plugin Tasks

- Extend plugin host command API with a streaming handle.
- Add event subscription helpers for command runs.
- Update Developer `developer.log` to append live output.
- Add Cancel button in Developer command runner/log view.
- Record final log into Developer command history after completion.

### Non-Goals For First Pass

- Interactive stdin.
- Terminal emulator behavior.
- PTY support.
- Remote execution.
- Hunk apply/reject or patch transactions.
