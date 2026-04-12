import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSettings as fetchBackendSettings, listCronJobs, saveSettings as persistBackendSettings } from '@/core/runtime/api/commands';
import type { BackendCronJobConfig, BackendSettings } from '@/shared/types/api';
import type { ThemePresetName } from '@/ui/theme';

export interface ProviderModel {
  id: string;
  name: string;
  enabled: boolean;
  note?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModel[];
}

export interface HookConfig {
  id: string;
  stage: 'pre_tool_use' | 'post_tool_use' | 'session_start' | 'session_end';
  type: 'command' | 'http';
  matcher: string;
  timeout: number;
  blockOnFailure: boolean;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  endpoint: string;
  enabled: boolean;
}

export interface CronJobConfig {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  cwd: string;
  enabled: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  themePreset: ThemePresetName;
  autoSaveSessions: boolean;
  providers: ProviderConfig[];
  systemPrompt: string;
  defaultProfileId: string;
  defaultReasoning: 'low' | 'medium' | 'high';
  permissionMode: 'default' | 'plan' | 'full_auto';
  allowedTools: string[];
  deniedTools: string[];
  pathRules: string[];
  deniedCommands: string[];
  memoryEnabled: boolean;
  memoryMaxFiles: number;
  memoryMaxEntrypointLines: number;
  hooks: HookConfig[];
  mcpServers: MCPServerConfig[];
  enabledPlugins: string[];
  runtimeProfiles: BackendSettings['runtimeProfiles'];
  cronJobs: CronJobConfig[];
}

const INITIAL_SETTINGS_SNAPSHOT: AppSettings = {
  theme: 'system',
  themePreset: 'refined',
  autoSaveSessions: true,
  providers: [],
  systemPrompt: '',
  defaultProfileId: 'chat',
  defaultReasoning: 'medium',
  permissionMode: 'default',
  allowedTools: [],
  deniedTools: [],
  pathRules: [],
  deniedCommands: [],
  memoryEnabled: true,
  memoryMaxFiles: 0,
  memoryMaxEntrypointLines: 0,
  hooks: [],
  mcpServers: [],
  enabledPlugins: [],
  runtimeProfiles: [],
  cronJobs: [],
};

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  isHydratedFromBackend: boolean;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
  setLoading: (loading: boolean) => void;
  hydrateFromBackend: () => Promise<void>;
  saveToBackend: () => Promise<void>;
}

let saveSettingsTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBackendSettingsSave(settings: AppSettings) {
  if (saveSettingsTimer) {
    clearTimeout(saveSettingsTimer);
  }

  saveSettingsTimer = setTimeout(() => {
    void persistBackendSettings(toBackendSettings(settings)).catch((error) => {
      console.error('Failed to auto-save settings', error);
    });
    saveSettingsTimer = null;
  }, 400);
}

function clearScheduledBackendSettingsSave() {
  if (saveSettingsTimer) {
    clearTimeout(saveSettingsTimer);
    saveSettingsTimer = null;
  }
}

function normalizeSettings(input?: Partial<AppSettings> | null): AppSettings {
  return {
    ...INITIAL_SETTINGS_SNAPSHOT,
    ...input,
    providers: input?.providers || [],
    allowedTools: input?.allowedTools || [],
    deniedTools: input?.deniedTools || [],
    pathRules: input?.pathRules || [],
    deniedCommands: input?.deniedCommands || [],
    hooks: input?.hooks || [],
    mcpServers: input?.mcpServers || [],
    enabledPlugins: input?.enabledPlugins || [],
    runtimeProfiles: input?.runtimeProfiles || [],
    cronJobs: input?.cronJobs || [],
  };
}

function mapBackendSettings(input: BackendSettings, cronJobs: BackendCronJobConfig[]): AppSettings {
  return {
    theme: input.theme || 'system',
    themePreset: (input.themePreset as ThemePresetName | undefined) || 'refined',
    autoSaveSessions: input.autoSaveSessions ?? true,
    providers: input.providers || [],
    systemPrompt: input.systemPrompt ?? '',
    defaultProfileId: input.defaultProfileId ?? INITIAL_SETTINGS_SNAPSHOT.defaultProfileId,
    defaultReasoning: input.defaultReasoning ?? INITIAL_SETTINGS_SNAPSHOT.defaultReasoning,
    permissionMode: input.permissionMode ?? INITIAL_SETTINGS_SNAPSHOT.permissionMode,
    allowedTools: input.allowedTools || [],
    deniedTools: input.deniedTools || [],
    pathRules: input.pathRules || [],
    deniedCommands: input.deniedCommands || [],
    memoryEnabled: input.memoryEnabled ?? INITIAL_SETTINGS_SNAPSHOT.memoryEnabled,
    memoryMaxFiles: input.memoryMaxFiles ?? INITIAL_SETTINGS_SNAPSHOT.memoryMaxFiles,
    memoryMaxEntrypointLines: input.memoryMaxEntrypointLines ?? INITIAL_SETTINGS_SNAPSHOT.memoryMaxEntrypointLines,
    hooks: input.hooks || [],
    mcpServers: input.mcpServers || [],
    enabledPlugins: input.enabledPlugins || [],
    runtimeProfiles: input.runtimeProfiles || [],
    cronJobs: cronJobs.map((job) => ({
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      prompt: job.prompt || job.command || '',
      cwd: job.cwd,
      enabled: job.enabled,
    })),
  };
}

function toBackendSettings(settings: AppSettings): BackendSettings {
  const normalized = normalizeSettings(settings);
  return {
    theme: normalized.theme,
    themePreset: normalized.themePreset,
    autoSaveSessions: normalized.autoSaveSessions,
    providers: normalized.providers,
    systemPrompt: normalized.systemPrompt,
    defaultProfileId: normalized.defaultProfileId,
    defaultReasoning: normalized.defaultReasoning,
    permissionMode: normalized.permissionMode,
    allowedTools: normalized.allowedTools,
    deniedTools: normalized.deniedTools,
    pathRules: normalized.pathRules,
    deniedCommands: normalized.deniedCommands,
    memoryEnabled: normalized.memoryEnabled,
    memoryMaxFiles: normalized.memoryMaxFiles,
    memoryMaxEntrypointLines: normalized.memoryMaxEntrypointLines,
    hooks: normalized.hooks,
    mcpServers: normalized.mcpServers,
    enabledPlugins: normalized.enabledPlugins,
    runtimeProfiles: normalized.runtimeProfiles,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: INITIAL_SETTINGS_SNAPSHOT,
      isLoading: false,
      isHydratedFromBackend: false,

      updateSettings: (updates) =>
        set((state) => {
          const settings = normalizeSettings({ ...state.settings, ...updates });
          scheduleBackendSettingsSave(settings);
          return { settings };
        }),

      resetSettings: () =>
        set(() => {
          const settings = normalizeSettings(INITIAL_SETTINGS_SNAPSHOT);
          scheduleBackendSettingsSave(settings);
          return { settings };
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      hydrateFromBackend: async () => {
        set({ isLoading: true });
        try {
          const [settings, cronJobs] = await Promise.all([fetchBackendSettings(), listCronJobs()]);
          set({
            settings: normalizeSettings(mapBackendSettings(settings, cronJobs)),
            isLoading: false,
            isHydratedFromBackend: true,
          });
        } catch {
          set({ isLoading: false });
        }
      },

      saveToBackend: async () => {
        clearScheduledBackendSettingsSave();
        const current = useSettingsStore.getState().settings;
        await persistBackendSettings(toBackendSettings(current));
      },
    }),
    {
      name: 'rhythm-settings-v2',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persistedState, currentState) => {
        const typedPersistedState = persistedState as Partial<SettingsState> | undefined;
        return {
          ...currentState,
          ...typedPersistedState,
          settings: normalizeSettings(typedPersistedState?.settings),
        };
      },
    },
  ),
);
