import type React from 'react';
import type { Message, ToolCall } from '@/shared/types/schema';

export interface Disposable {
  dispose: () => void;
}

export type PluginCommandHandler<TInput = unknown, TOutput = unknown> =
  (input: TInput) => Promise<TOutput> | TOutput;

export interface ActivityBarContribution {
  id: string;
  title: string;
  icon?: string;
  opens: string;
  scope?: 'workspace' | 'global';
  pluginId?: string;
}

export interface LeftPanelProps {
  ctx: PluginContext;
  width: number;
}

export type LeftPanelComponent = React.ComponentType<LeftPanelProps>;

export interface WorkbenchProps<TPayload = unknown> {
  ctx: PluginContext;
  title: string;
  description?: string;
  payload: TPayload;
}

export type WorkbenchComponent<TPayload = unknown> = React.ComponentType<WorkbenchProps<TPayload>>;

export interface SettingsSectionProps {
  ctx: PluginContext;
}

export type SettingsSectionComponent = React.ComponentType<SettingsSectionProps>;

export interface LeftPanelContribution {
  id: string;
  title: string;
  icon?: string;
  component: LeftPanelComponent;
  pluginId?: string;
}

export interface WorkbenchContribution<TPayload = unknown> {
  id: string;
  title: string;
  component: WorkbenchComponent<TPayload>;
  pluginId?: string;
}

export interface OverlayProps<TPayload = unknown> {
  ctx: PluginContext;
  title: string;
  description?: string;
  payload: TPayload;
}

export type OverlayComponent<TPayload = unknown> = React.ComponentType<OverlayProps<TPayload>>;

export interface OverlayContribution<TPayload = unknown> {
  id: string;
  title: string;
  component: OverlayComponent<TPayload>;
  pluginId?: string;
}

export interface SettingsSectionContribution {
  id: string;
  title: string;
  description?: string;
  component: SettingsSectionComponent;
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
  id?: string;
  viewId: string;
  title: string;
  description?: string;
  payload: TPayload;
  lifecycle?: 'snapshot' | 'live';
  layoutMode?: 'split' | 'replace';
}

export interface OpenOverlayInput<TPayload = unknown> {
  id?: string;
  viewId: string;
  title: string;
  description?: string;
  payload: TPayload;
  kind?: 'drawer' | 'modal';
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

export interface PermissionApi {
  check: (capability: string) => boolean;
  request: (capability: string, reason: string) => Promise<boolean>;
}

export interface CommandRegistryApi {
  register: <TInput = unknown, TOutput = unknown>(
    id: string,
    handler: PluginCommandHandler<TInput, TOutput>,
    metadata?: CommandRegistrationMetadata,
  ) => Disposable;
  execute: <TInput = unknown, TOutput = unknown>(id: string, input: TInput) => Promise<TOutput>;
  start: <TInput = unknown, TOutput = unknown>(
    id: string,
    input: TInput,
    listener?: (event: CommandStreamEvent<TOutput>) => void,
  ) => Promise<RunningCommand<TOutput>>;
}

export interface CommandRegistrationMetadata {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

export type CommandStreamEvent<TOutput = unknown> =
  | { type: 'started'; runId: string; pluginName: string; commandId: string }
  | { type: 'stdout'; runId: string; chunk: string }
  | { type: 'stderr'; runId: string; chunk: string }
  | { type: 'completed'; runId: string; result: TOutput }
  | { type: 'error'; runId: string; message: string }
  | { type: 'cancelled'; runId: string };

export interface RunningCommand<TOutput = unknown> {
  runId: string;
  result: Promise<TOutput>;
  cancel: () => Promise<boolean>;
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
  overlay: {
    register: <TPayload = unknown>(view: OverlayContribution<TPayload>) => Disposable;
    open: <TPayload = unknown>(input: OpenOverlayInput<TPayload>) => void;
    close: () => void;
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

export type PluginDefinition = RhythmPlugin;
