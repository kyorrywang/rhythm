import type React from 'react';
import type { BackendWorkspaceDirEntry, BackendWorkspaceShellResult, BackendWorkspaceTextFile } from '@/shared/types/api';
import type { Message, ToolCall } from '@/shared/types/schema';

export interface Disposable {
  dispose: () => void;
}

export type PluginRuntimeStatus = 'pending' | 'active' | 'load_error' | 'runtime_error' | 'disabled' | 'blocked';

export interface PluginRuntimeRecord {
  pluginId: string;
  status: PluginRuntimeStatus;
  source: 'core' | 'dev' | 'external' | 'manifest';
  entry?: string;
  error?: string;
  activatedAt?: number;
}

export interface ActivityBarContribution {
  id: string;
  title: string;
  icon?: string;
  opens: string;
  pluginId?: string;
}

export interface LeftPanelProps {
  ctx: PluginContext;
  width: number;
}

export interface WorkbenchProps<TPayload = unknown> {
  ctx: PluginContext;
  title: string;
  description?: string;
  payload: TPayload;
}

export interface SettingsSectionProps {
  ctx: PluginContext;
}

export interface LeftPanelContribution {
  id: string;
  title: string;
  icon?: string;
  component: React.ComponentType<LeftPanelProps>;
  pluginId?: string;
}

export interface WorkbenchContribution<TPayload = unknown> {
  id: string;
  title: string;
  component: React.ComponentType<WorkbenchProps<TPayload>>;
  pluginId?: string;
}

export interface SettingsSectionContribution {
  id: string;
  title: string;
  description?: string;
  component: React.ComponentType<SettingsSectionProps>;
  pluginId?: string;
}

export interface MessageActionContext {
  ctx: PluginContext;
  message: Message;
  sessionId: string;
}

export interface ToolResultActionContext {
  ctx: PluginContext;
  tool: ToolCall;
  sessionId: string;
}

export interface MessageActionContribution {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  group?: string;
  order?: number;
  danger?: boolean;
  inputSchema?: unknown;
  pluginId?: string;
  when?: (context: MessageActionContext) => boolean;
  run: (context: MessageActionContext) => void | Promise<void>;
}

export interface ToolResultActionContribution {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  group?: string;
  order?: number;
  danger?: boolean;
  inputSchema?: unknown;
  pluginId?: string;
  when?: (context: ToolResultActionContext) => boolean;
  run: (context: ToolResultActionContext) => void | Promise<void>;
}

export interface OpenWorkbenchInput<TPayload = unknown> {
  viewId: string;
  title: string;
  description?: string;
  payload: TPayload;
  lifecycle?: 'snapshot' | 'live';
}

export interface WorkspaceApi {
  cwd: () => string;
  listDir: (path: string) => Promise<{ path: string; entries: BackendWorkspaceDirEntry[] }>;
  readTextFile: (path: string) => Promise<BackendWorkspaceTextFile>;
}

export interface StorageApi {
  get: <T = unknown>(key: string) => Promise<T | null>;
  set: <T = unknown>(key: string, value: T) => Promise<void>;
  delete: (key: string) => Promise<void>;
  files: {
    readText: (path: string) => Promise<string | null>;
    writeText: (path: string, content: string) => Promise<void>;
    delete: (path: string) => Promise<void>;
    list: (path?: string) => Promise<string[]>;
  };
}

export interface ShellApi {
  run: (command: string, options?: ShellRunOptions) => Promise<BackendWorkspaceShellResult>;
}

export interface ShellRunOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface PermissionApi {
  check: (capability: string) => boolean;
  request: (capability: string, reason: string) => Promise<boolean>;
}

export interface CommandRegistryApi {
  register: <TInput = unknown, TOutput = unknown>(
    id: string,
    handler: (input: TInput) => Promise<TOutput> | TOutput,
    metadata?: CommandRegistrationMetadata,
  ) => Disposable;
  execute: <TInput = unknown, TOutput = unknown>(id: string, input: TInput) => Promise<TOutput>;
}

export interface CommandRegistrationMetadata {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

export interface EventBusApi {
  on: (event: string, handler: (payload: unknown) => void) => Disposable;
  emit: (event: string, payload: unknown) => void;
}

export type PluginTaskStatus = 'running' | 'completed' | 'error' | 'cancelled';

export interface PluginTaskRecord {
  id: string;
  pluginId: string;
  title: string;
  status: PluginTaskStatus;
  detail?: string;
  startedAt: number;
  updatedAt: number;
}

export interface TaskStartInput {
  id?: string;
  title: string;
  detail?: string;
}

export interface TaskUpdateInput {
  status?: PluginTaskStatus;
  detail?: string;
}

export interface TaskApi {
  start: (input: TaskStartInput) => PluginTaskRecord;
  update: (taskId: string, input: TaskUpdateInput) => void;
  complete: (taskId: string, detail?: string) => void;
  fail: (taskId: string, error: unknown) => void;
}

export interface PluginUiApi {
  activityBar: {
    register: (item: ActivityBarContribution) => Disposable;
  };
  leftPanel: {
    register: (view: LeftPanelContribution) => Disposable;
  };
  workbench: {
    register: <TPayload = unknown>(view: WorkbenchContribution<TPayload>) => Disposable;
    open: <TPayload = unknown>(input: OpenWorkbenchInput<TPayload>) => void;
  };
  messageActions: {
    register: (action: MessageActionContribution) => Disposable;
  };
  toolResultActions: {
    register: (action: ToolResultActionContribution) => Disposable;
  };
  settings: {
    register: (section: SettingsSectionContribution) => Disposable;
  };
}

export interface PluginContext {
  id: string;
  workspace: WorkspaceApi;
  shell: ShellApi;
  storage: StorageApi;
  permissions: PermissionApi;
  commands: CommandRegistryApi;
  events: EventBusApi;
  tasks: TaskApi;
  ui: PluginUiApi;
}

export interface RhythmPlugin {
  activate: (ctx: PluginContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

export function definePlugin(plugin: RhythmPlugin) {
  return plugin;
}
