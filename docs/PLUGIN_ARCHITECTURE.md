# Rhythm Plugin Architecture

This document captures the current plugin architecture after the framework收口 work.

Rhythm follows the VS Code extension philosophy for UI and app commands, while keeping Rhythm-specific agent capabilities such as skills and tools aligned with the existing backend implementation.

## Goals

- Keep the core minimal.
- Let plugin packages provide product capabilities.
- Avoid business-specific branches in core code.
- Let plugins depend on other plugins and call their exposed parts.
- Use one command entry point for plugin-to-plugin and UI-to-plugin calls.
- Keep Agent-specific backend extensions, such as skills, tools, and MCP, compatible with the backend architecture that already exists.

## Core Principle

If a plugin capability requires adding business-specific code to core, the plugin system is incomplete.

Core may grow only when the new API is a host capability, not a product feature. Examples of valid host capabilities:

- Plugin loading and lifecycle.
- Contribution registries.
- Command registry and dispatch.
- Permission checks and diagnostics.
- Workspace/session context passing.
- Plugin storage.
- UI slot hosting.
- Agent tool registry integration.

Examples that should not be hardcoded in core:

- Folder tree behavior.
- File create/delete/rename behavior.
- Developer diff behavior.
- Workflow graph behavior.
- Web browsing behavior.

## Package And Extensions

A plugin package is a container. It may provide one or more extension types.

Examples:

- A pure skill package provides only `contributes.skills`.
- A UI package provides `main` plus views and commands.
- A tool package provides `contributes.tools`.
- A product package like `developer` may provide UI, commands, tools, and skills.
- A product package like `workflow` may provide UI, commands, settings, and its own plugin-level runtime without adding workflow concepts to core.
- Workflow currently validates Workbench as a complex plugin view host with a lightweight graph canvas and JSON import/export.

## Manifest Shape

Rhythm uses a VS Code-like manifest shape, simplified for our needs:

```json
{
  "name": "developer",
  "version": "0.1.0",
  "description": "Developer workflow tools and views.",
  "enabledByDefault": true,
  "main": "dist/main.js",
  "permissions": [
    "terminal.run"
  ],
  "requires": {
    "plugins": {
      "folder": "^0.1.0"
    },
    "commands": [
      "folder.read",
      "folder.list"
    ],
    "tools": []
  },
  "contributes": {
    "commands": [],
    "views": [],
    "menus": [],
    "settings": [],
    "skills": [],
    "tools": []
  }
}
```

Current plugin manifests should use `main`, `dev.main`, `requires.plugins/commands/tools`, and `contributes.commands/views/tools/skills/settings/menus`.

Legacy top-level `entry` is no longer allowed for local plugins.

## UI Entry

Formal plugin UI entry is built JavaScript:

```json
{
  "main": "dist/main.js"
}
```

Development mode uses a fixed dev entry:

```json
{
  "main": "dist/main.js",
  "dev": {
    "main": "src/main.tsx"
  }
}
```

Current rule:

- `main` must be `dist/main.js`
- `dev.main` must be `src/main.tsx`
- Official plugins currently keep `dist/main.js` checked in. This keeps validation and non-dev loading deterministic while the plugin package format is still local-first.
- Local plugin install previews manifest metadata, permissions, dependencies, destination path, overwrite status, and warnings before copying files.
- Uninstall currently supports keeping or deleting workspace-scoped plugin storage.

## Contributions

The core contribution points should be small:

- `commands`
- `views`
- `menus`
- `settings`
- `skills`
- `tools`

Workflow nodes are not a core contribution point for now. They should be owned by the Workflow plugin as a secondary extension system.

MCP is also not a plugin category for now. It remains configuration consumed by the existing MCP system.

## Commands

Commands are the app and plugin-to-plugin invocation surface.

All plugin consumers should use:

```ts
await ctx.commands.execute('folder.read', { path: 'README.md' });
```

Command implementation can be UI-side, backend-side, or a wrapper around a tool. The caller should not care.

Command manifest examples:

```json
{
  "contributes": {
    "commands": [
      {
        "id": "folder.reveal",
        "description": "Reveal a file or folder in the operating system file manager.",
        "parameters": {
          "type": "object",
          "properties": {
            "path": { "type": "string" }
          },
          "required": ["path"]
        },
        "readOnly": true,
        "implementation": "ui"
      },
      {
        "id": "folder.read",
        "tool": "folder.read"
      }
    ]
  }
}
```

The first command is a UI command. The second command forwards to a tool.

## Tools

Tools are Agent-facing backend capabilities.

Tools should stay aligned with the existing Rust backend `ToolRegistry` and `BaseTool` architecture. For now, do not replace the backend implementation.

Tool manifest example:

```json
{
  "contributes": {
    "tools": [
      {
        "id": "folder.read",
        "description": "Read a text file in the current workspace.",
        "parameters": {
          "type": "object",
          "properties": {
            "path": { "type": "string" }
          },
          "required": ["path"]
        },
        "readOnly": true,
        "permissions": ["workspace.files.read"],
        "runtime": "node",
        "entry": "src/tools/main.js",
        "handler": "read"
      }
    ]
  }
}
```

Rules:

- `tools` are exposed to the Agent by default when the plugin is enabled.
- `commands` are not exposed to the Agent by default.
- If UI or another plugin needs to call a tool, expose a command that forwards to the tool.
- Existing built-in tools, such as read, write, edit, delete, and shell, should eventually be command-callable without becoming ad hoc frontend host APIs.

## Skills

Skills remain Agent context extensions.

Skill-only plugins should be simple:

```json
{
  "name": "code-review-skills",
  "version": "0.1.0",
  "description": "Code review guidance for the agent.",
  "enabledByDefault": true,
  "contributes": {
    "skills": [
      {
        "dir": "skills"
      }
    ]
  }
}
```

Current skill loading already supports plugin-contributed skills through plugin directories. The manifest shape can be migrated later without changing the underlying idea.

## MCP

MCP should remain configuration for now.

Do not introduce a separate `mcp plugin` type yet. Existing MCP config loading can continue to consume app settings and plugin-local config if needed, but MCP is not part of the first manifest redesign.

## Dependencies

Avoid abstract `capabilities` for now. They are too vague unless provider resolution is fully designed.

Use concrete dependencies first:

```json
{
  "requires": {
    "plugins": {
      "folder": "^0.1.0"
    },
    "commands": [
      "folder.read",
      "folder.list"
    ],
    "tools": [
      "folder.read"
    ]
  }
}
```

Rules:

- Missing plugin means blocked.
- Version mismatch means blocked.
- Missing command means blocked.
- Missing tool means blocked.
- Circular plugin dependency means blocked.

Capabilities can come back later if the first three complete plugins prove a real need for abstract substitution.

## Permissions

Permissions should be checked at execution time by the host.

Recommended layers:

- Plugin package declares all permissions it may use.
- Tool/command declares the specific permissions it requires.
- User grants permissions per workspace and plugin.
- Dangerous operations may request dynamic confirmation.

Example:

```json
{
  "permissions": [
    "workspace.files.read",
    "workspace.files.write"
  ],
  "contributes": {
    "tools": [
      {
        "id": "folder.delete",
        "permissions": ["workspace.files.write"],
        "readOnly": false
      }
    ]
  }
}
```

The host should verify:

- The plugin declared the permission.
- The user granted the permission.
- The invoked command or tool requires and is allowed to use the permission.

## Views

Views follow the existing frontend plugin host model.

The plugin registers React components from its SDK entry:

```ts
import { definePlugin } from '../../../src/plugin/sdk';

export default definePlugin({
  activate(ctx) {
    ctx.ui.leftPanel.register({
      id: 'folder.tree',
      title: 'Files',
      component: FolderTree
    });

    ctx.ui.workbench.register({
      id: 'folder.file.preview',
      title: 'File Preview',
      component: FilePreview
    });
  }
});
```

Core only hosts the slot and renders registered components. It does not know what a folder tree, diff view, or workflow graph is.

Official and local plugins should import from `src/plugin/sdk`, never from `src/plugin/host`.

## Main Stage

The app shell now separates three concerns:

- `ActivityRail` for activity navigation
- `LeftPanelHost` for the active left panel view
- `MainStage` for the main content layout

`MainStage` is the only place that decides how chat session content and Workbench content coexist.

Current Workbench layout modes:

- `split`: show Session and Workbench side by side
- `replace`: Workbench replaces the Session area

Sidebar does not control whether Session is visible. That is a `MainStage` responsibility.

## Workbench Host

Workbench is intentionally small:

- it hosts one active Workbench view
- it supports `split` and `replace`
- it does not own tabs

If a plugin wants tabs, it should render them inside its own Workbench view.

This keeps core from turning into a full editor manager.

## Overlay Host

Overlay is separate from Workbench.

Current overlay shell types:

- `drawer`
- `modal`

Overlay is intended for temporary or secondary surfaces such as inspectors, side sheets, and future workflow node property panels.

Workbench should stay focused on primary main-stage content. Overlay should handle temporary layered UI.

## Activity Rail

The left rail follows a VS Code-style downgraded workspace model:

- Top group: workspace-scoped activities for the active workspace.
- Bottom group: global activities such as plugin management and settings.

Activity contributions support `scope`:

```ts
ctx.ui.activityBar.register({
  id: 'folder.activity',
  title: 'Files',
  icon: 'folder',
  scope: 'workspace',
  opens: 'folder.tree',
});
```

If `scope` is omitted, the activity is treated as `workspace`.

Core provides `core.sessions.activity` / `core.sessions.panel` as a workspace-scoped activity. Sessions are therefore a normal left panel view, not a hardcoded Sidebar mode.

## Menus

Menus should be contribution points, not hardcoded UI.

Example:

```json
{
  "contributes": {
    "menus": [
      {
        "location": "folder.tree.item",
        "command": "folder.reveal",
        "title": "Reveal in Explorer"
      }
    ]
  }
}
```

The menu location is owned by the plugin or host that renders that surface. For example, `folder.tree.item` is a location owned by the Folder plugin.

This lets Developer contribute actions to Folder later without core knowing either plugin's business logic.

## Settings

Settings are contribution points.

Plugins can register settings UI through the frontend plugin runtime, and later declare them in manifest:

```json
{
  "contributes": {
    "settings": [
      {
        "id": "developer.settings",
        "title": "Developer"
      }
    ]
  }
}
```

The current `ctx.ui.settings.register(...)` is aligned with this direction.

## Built-In Capabilities

Current built-in backend tools should eventually be treated like built-in packages, not special business code in the core.

Examples:

- `core.agent`: ask, plan, subagent, skill.
- `core.tools`: read, write, edit, delete, shell.
- `core.ui`: plugin manager and settings UI.

This can be migrated gradually. It should not block the three main product plugins.

## Backend Runtime Bridge

Node/Python plugin commands and tools run out-of-process. They receive the initial call payload through `RHYTHM_PLUGIN_CALL`.

If they need host capabilities, they should use the runtime JSON-RPC bridge over stdio rather than directly reaching into app internals.

Currently supported method:

```json
{
  "method": "command.execute",
  "params": {
    "commandId": "tool.shell",
    "input": {
      "command": "git status --short"
    }
  }
}
```

This keeps backend plugin runtimes aligned with the same command permission and diagnostics path as UI plugins.

Dynamic command execution requires the caller plugin to request and be granted `plugin.command.invoke`.

## Workflow Node Executors

Workflow owns its node system as a secondary extension layer.

The core framework does not know workflow nodes. Workflow runtime is responsible for:

- graph scheduling
- node run state
- executor lookup
- run trace persistence

Concrete node behavior is implemented by registered executors. Built-in Workflow executors currently include:

- `manual`
- `shell`
- `command`
- `workflow.llm`

Other plugins can contribute command-backed node types through Workflow's event/command protocol. Agent-facing Workflow runs can execute contributed nodes only when their backing command is available to the backend runtime.

## Three Target Plugins

### Folder

Provides:

- UI views: folder tree.
- Commands: folder reveal/open interactions.
- Tools: list/read/create/rename/delete if and when backend tool contribution is ready.
- Skills: optional instructions for file operations.

### Developer

Provides:

- UI views: dev panel, diff view, validation view, logs.
- Commands: git diff, git status, run validation.
- Skills: coding, review, debugging guidance.
- Workflow node contributions: validation and git diff nodes through Workflow's secondary extension point.
- Dependencies: folder plugin and relevant built-in commands/tools.

### Workflow

Provides:

- UI views: workflow list, graph editor, run view.
- Commands: create workflow, run workflow, cancel run.
- Tools: agent-facing workflow operations.
- Its own secondary extension point for workflow node executors.
- Built-in node executors: manual, shell, command, and LLM.

Workflow node extensions should be owned by Workflow, not by core. The Workflow runtime should schedule nodes and dispatch to registered node executors; it should not branch on concrete node types such as shell, command, or LLM.

## Current Status

The following are already in place:

1. `main` + `dev.main` manifest shape.
2. `requires.commands` and `requires.tools` checks.
3. `ctx.commands.execute(...)` as the unified command entry point.
4. Built-in command-callable tools such as `tool.list_dir`, `tool.read_file`, and `tool.shell`.
5. Folder and Developer migrated to the SDK import surface.
6. Plugin-only validation, typecheck, and build commands:
   - `npm run validate:plugins`
   - `npm run typecheck:plugins`
   - `npm run build:plugins`
7. A first plugin ecosystem layer:
   - local install
   - uninstall
   - enable/disable
   - permissions
   - diagnostics
8. A first settings layer:
   - core settings panel
   - plugin settings aggregation
   - settings overview and search
9. Streaming shell command support via `ctx.commands.start(...)`.
10. Workflow node executor registry and built-in `workflow.llm` node through the thin host command `core.llm.complete`.
11. Backend plugin runtime host command bridge, so Agent-facing Workflow tools can execute command-backed and LLM nodes without adding node-type branches to core.

## Non-Goals For Now

- Full VS Code compatibility.
- Marketplace.
- Remote extension host.
- Full activation events.
- Abstract capability provider matching.
- Workflow node contribution in core.
- MCP as a first-class plugin type.
