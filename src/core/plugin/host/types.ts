export type {
  ActivityBarContribution,
  CommandRegistrationMetadata,
  CommandRegistryApi,
  Disposable,
  EventBusApi,
  LeftPanelContribution,
  OverlayContribution,
  OverlayProps,
  MessageActionContribution,
  MessageActionContext,
  OpenOverlayInput,
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
  PluginContext,
  RhythmPlugin,
  LeftPanelProps,
  OverlayComponent,
  WorkbenchProps,
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
