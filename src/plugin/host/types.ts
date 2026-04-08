import type { PluginContext as SdkPluginContext } from '../sdk/types';
import type { BackendWorkspaceDirEntry, BackendWorkspaceShellResult, BackendWorkspaceTextFile } from '@/shared/types/api';

export type {
  ActivityBarContribution,
  CommandRegistrationMetadata,
  CommandRegistryApi,
  Disposable,
  EventBusApi,
  LeftPanelContribution,
  MessageActionContribution,
  MessageActionContext,
  OpenWorkbenchInput,
  PermissionApi,
  PluginTaskRecord,
  PluginTaskStatus,
  SettingsSectionContribution,
  SettingsSectionProps,
  StorageApi,
  TaskApi,
  TaskStartInput,
  TaskUpdateInput,
  ToolResultActionContribution,
  ToolResultActionContext,
  WorkbenchContribution,
} from '../sdk/types';

export type PluginRuntimeStatus = 'pending' | 'active' | 'load_error' | 'runtime_error' | 'disabled' | 'blocked';

export interface PluginRuntimeRecord {
  pluginId: string;
  status: PluginRuntimeStatus;
  source: 'core' | 'dev' | 'external' | 'manifest';
  entry?: string;
  error?: string;
  activatedAt?: number;
}

export interface HostWorkspaceApi {
  cwd: () => string;
  /** @deprecated Use ctx.commands.execute('tool.list_dir', ...) instead. */
  listDir: (path: string) => Promise<{ path: string; entries: BackendWorkspaceDirEntry[] }>;
  /** @deprecated Use ctx.commands.execute('tool.read_file', ...) instead. */
  readTextFile: (path: string) => Promise<BackendWorkspaceTextFile>;
}

export interface HostShellApi {
  /** @deprecated Use ctx.commands.execute('tool.shell', ...) instead. */
  run: (command: string, options?: ShellRunOptions) => Promise<BackendWorkspaceShellResult>;
}

export type ShellApi = HostShellApi;
export type WorkspaceApi = HostWorkspaceApi;

export interface ShellRunOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface PluginContext extends SdkPluginContext {
  workspace: HostWorkspaceApi;
  shell: HostShellApi;
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

export interface RhythmPlugin {
  activate: (ctx: PluginContext) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

export function definePlugin(plugin: RhythmPlugin) {
  return plugin;
}
