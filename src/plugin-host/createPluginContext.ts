import {
  deletePluginStorageValue,
  getPluginStorageValue,
  invokePluginCommand,
  listWorkspaceDir,
  listPluginStorageFiles,
  readWorkspaceTextFile,
  readPluginStorageTextFile,
  runWorkspaceShell,
  setPluginStorageValue,
  writePluginStorageTextFile,
  deletePluginStorageFile,
} from '@/shared/api/commands';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { useWorkspaceStore } from '@/shared/state/useWorkspaceStore';
import type { Disposable, PluginContext } from './types';
import { usePluginHostStore } from './usePluginHostStore';

export function createPluginContext(pluginId: string, trackDisposable?: (disposable: Disposable) => void): PluginContext {
  const tracked = (dispose: () => void): Disposable => {
    const disposable = { dispose };
    trackDisposable?.(disposable);
    return disposable;
  };

  return {
    id: pluginId,
    workspace: {
      cwd: getActiveWorkspacePath,
      listDir: (path) => {
        assertPermission(pluginId, 'workspace.files.read');
        return listWorkspaceDir(getActiveWorkspacePath(), path);
      },
      readTextFile: (path) => {
        assertPermission(pluginId, 'workspace.files.read');
        return readWorkspaceTextFile(getActiveWorkspacePath(), path);
      },
    },
    shell: {
      run: (command, options) => {
        assertPermission(pluginId, 'terminal.run');
        return runWorkspaceShell({
          cwd: getActiveWorkspacePath(),
          command,
          timeout_ms: options?.timeoutMs,
          max_output_bytes: options?.maxOutputBytes,
        });
      },
    },
    storage: {
      get: (key) => getPluginStorageValue({
        cwd: getActiveWorkspacePath(),
        plugin_name: pluginId,
        key,
      }),
      set: (key, value) => setPluginStorageValue({
        cwd: getActiveWorkspacePath(),
        plugin_name: pluginId,
        key,
        value,
      }),
      delete: (key) => deletePluginStorageValue({
        cwd: getActiveWorkspacePath(),
        plugin_name: pluginId,
        key,
      }),
      files: {
        readText: (path) => readPluginStorageTextFile({
          cwd: getActiveWorkspacePath(),
          plugin_name: pluginId,
          path,
        }),
        writeText: (path, content) => writePluginStorageTextFile({
          cwd: getActiveWorkspacePath(),
          plugin_name: pluginId,
          path,
          content,
        }),
        delete: (path) => deletePluginStorageFile({
          cwd: getActiveWorkspacePath(),
          plugin_name: pluginId,
          path,
        }),
        list: (path = '.') => listPluginStorageFiles({
          cwd: getActiveWorkspacePath(),
          plugin_name: pluginId,
          path,
        }),
      },
    },
    permissions: {
      check: (capability) => hasPluginPermission(pluginId, capability),
      request: async (capability) => hasPluginPermission(pluginId, capability),
    },
    commands: {
      register: (id, handler, metadata): Disposable =>
        tracked(usePluginHostStore.getState().registerCommand(pluginId, id, handler as never, metadata)),
      execute: async (id, input) => {
        const command = usePluginHostStore.getState().commandHandlers[id];
        if (!command) {
          const uiCommand = findManifestCommand(id);
          if (uiCommand?.implementation === 'ui') {
            throw new Error(`Command '${id}' is declared as UI command but no handler was registered`);
          }
          return executeBackendCommand(pluginId, id, input);
        }
        const startedAt = Date.now();
        const inputValidationError = validateSchema(command.metadata?.inputSchema, input);
        if (inputValidationError) {
          const error = new Error(`Command '${id}' input schema validation failed: ${inputValidationError}`);
          usePluginHostStore.getState().reportPluginError(command.pluginId, error);
          usePluginHostStore.getState().recordCommandInvocation({
            id: `command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            pluginId: command.pluginId,
            type: 'command',
            name: id,
            status: 'error',
            message: error.message,
            createdAt: Date.now(),
          });
          throw error;
        }
        usePluginHostStore.getState().recordCommandInvocation({
          id: `command-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
          pluginId: command.pluginId,
          type: 'command',
          name: id,
          status: 'started',
          message: summarizePayload(input),
          createdAt: startedAt,
        });
        try {
          const result = await command.handler(input) as never;
          const outputValidationError = validateSchema(command.metadata?.outputSchema, result);
          if (outputValidationError) {
            throw new Error(`Command '${id}' output schema validation failed: ${outputValidationError}`);
          }
          usePluginHostStore.getState().recordCommandInvocation({
            id: `command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            pluginId: command.pluginId,
            type: 'command',
            name: id,
            status: 'completed',
            message: summarizePayload(result),
            createdAt: Date.now(),
          });
          return result;
        } catch (error) {
          usePluginHostStore.getState().reportPluginError(command.pluginId, error);
          usePluginHostStore.getState().recordCommandInvocation({
            id: `command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            pluginId: command.pluginId,
            type: 'command',
            name: id,
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            createdAt: Date.now(),
          });
          throw error;
        }
      },
    },
    events: {
      on: (event, handler): Disposable =>
        tracked(usePluginHostStore.getState().registerEventHandler(pluginId, event, handler)),
      emit: (event, payload) => usePluginHostStore.getState().emitPluginEvent(event, payload),
    },
    tasks: {
      start: (input) => usePluginHostStore.getState().startTask(pluginId, input.title, input.detail, input.id),
      update: (taskId, input) => usePluginHostStore.getState().updateTask(pluginId, taskId, input),
      complete: (taskId, detail) => usePluginHostStore.getState().updateTask(pluginId, taskId, {
        status: 'completed',
        detail,
      }),
      fail: (taskId, error) => usePluginHostStore.getState().updateTask(pluginId, taskId, {
        status: 'error',
        detail: error instanceof Error ? error.message : String(error),
      }),
    },
    ui: {
      activityBar: {
        register: (item): Disposable =>
          tracked(usePluginHostStore.getState().registerActivityBar(pluginId, item)),
      },
      leftPanel: {
        register: (view): Disposable =>
          tracked(usePluginHostStore.getState().registerLeftPanel(pluginId, view)),
      },
      workbench: {
        register: (view): Disposable =>
          tracked(usePluginHostStore.getState().registerWorkbench(pluginId, view as never)),
        open: (input) => {
          const view = usePluginHostStore.getState().workbenchViews[input.viewId];
          useSessionStore.getState().openWorkbench({
            isOpen: true,
            pluginId: view?.pluginId || pluginId,
            viewType: input.viewId,
            renderer: input.viewId,
            title: input.title,
            description: input.description,
            payload: input.payload,
            lifecycle: input.lifecycle || 'snapshot',
          });
        },
      },
      messageActions: {
        register: (action): Disposable =>
          tracked(usePluginHostStore.getState().registerMessageAction(pluginId, action)),
      },
      toolResultActions: {
        register: (action): Disposable =>
          tracked(usePluginHostStore.getState().registerToolResultAction(pluginId, action)),
      },
      settings: {
        register: (section): Disposable =>
          tracked(usePluginHostStore.getState().registerSettingsSection(pluginId, section)),
      },
    },
  };
}

function getActiveWorkspacePath() {
  const state = useWorkspaceStore.getState();
  return (
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.path ||
    state.workspaces[0]?.path ||
    ''
  );
}

function assertPermission(pluginId: string, capability: string) {
  if (!hasPluginPermission(pluginId, capability)) {
    const error = new Error(`Plugin '${pluginId}' is missing permission '${capability}'`);
    usePluginHostStore.getState().recordCommandInvocation({
      id: `permission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pluginId,
      type: 'command',
      name: `permission:${capability}`,
      status: 'error',
      message: error.message,
      createdAt: Date.now(),
    });
    throw error;
  }
}

function hasPluginPermission(pluginId: string, capability: string) {
  if (pluginId === 'core') return true;
  const plugin = usePluginStore.getState().plugins.find((candidate) => candidate.name === pluginId);
  if (!plugin) return false;
  const requested = plugin.permissions.includes('*') || plugin.permissions.includes(capability);
  const granted = plugin.granted_permissions.includes('*') || plugin.granted_permissions.includes(capability);
  return requested && granted;
}

function findManifestCommand(commandId: string): { implementation?: string } | null {
  for (const plugin of usePluginStore.getState().plugins) {
    for (const command of plugin.contributes.commands) {
      if (command.id === commandId) return command as { implementation?: string };
    }
  }
  return null;
}

async function executeBackendCommand<TOutput>(callerPluginId: string, commandId: string, input: unknown): Promise<TOutput> {
  const startedAt = Date.now();
  usePluginHostStore.getState().recordCommandInvocation({
    id: `backend-command-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    pluginId: callerPluginId,
    type: 'command',
    name: commandId,
    status: 'started',
    message: summarizePayload(input),
    createdAt: startedAt,
  });
  try {
    const response = await invokePluginCommand({
      cwd: getActiveWorkspacePath(),
      plugin_name: callerPluginId,
      command_id: commandId,
      input,
    });
    usePluginHostStore.getState().recordCommandInvocation({
      id: `backend-command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pluginId: response.plugin_name || callerPluginId,
      type: 'command',
      name: commandId,
      status: 'completed',
      message: summarizePayload(response.result),
      createdAt: Date.now(),
    });
    return response.result as TOutput;
  } catch (error) {
    usePluginHostStore.getState().reportPluginError(callerPluginId, error);
    usePluginHostStore.getState().recordCommandInvocation({
      id: `backend-command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pluginId: callerPluginId,
      type: 'command',
      name: commandId,
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      createdAt: Date.now(),
    });
    throw error;
  }
}

function summarizePayload(payload: unknown) {
  if (payload === undefined) return undefined;
  if (typeof payload === 'string') return payload.slice(0, 240);
  try {
    return JSON.stringify(payload).slice(0, 240);
  } catch {
    return String(payload).slice(0, 240);
  }
}

function validateSchema(schema: unknown, value: unknown): string | null {
  if (!schema || typeof schema !== 'object') return null;
  const descriptor = schema as {
    type?: string;
    required?: string[];
    properties?: Record<string, { type?: string }>;
  };
  if (descriptor.type && !matchesJsonSchemaType(value, descriptor.type)) {
    return `expected ${descriptor.type}, got ${Array.isArray(value) ? 'array' : typeof value}`;
  }
  if (descriptor.type === 'object' && descriptor.required && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const missing = descriptor.required.find((key) => record[key] === undefined);
    if (missing) return `missing required property '${missing}'`;
  }
  if (descriptor.type === 'object' && descriptor.properties && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const [key, property] of Object.entries(descriptor.properties)) {
      if (record[key] !== undefined && property.type && !matchesJsonSchemaType(record[key], property.type)) {
        return `property '${key}' expected ${property.type}, got ${Array.isArray(record[key]) ? 'array' : typeof record[key]}`;
      }
    }
  }
  return null;
}

function matchesJsonSchemaType(value: unknown, type: string) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'null') return value === null;
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number';
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === type;
}
