import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSettings as fetchBackendSettings, listCronJobs, saveSettings as persistBackendSettings } from '@/shared/api/commands';
import type { BackendCronJobConfig, BackendSettings } from '@/shared/types/api';

export interface ProviderModel {
  id: string;
  name: string;
  isDefault?: boolean;
  enabled: boolean;
  note?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  isDefault?: boolean;
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
  autoSaveSessions: boolean;
  providers: ProviderConfig[];
  systemPrompt: string;
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
  autoCompactEnabled: boolean;
  autoCompactThresholdRatio: number;
  autoCompactMaxMicroCompacts: number;
  enabledPlugins: string[];
  cronJobs: CronJobConfig[];
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  autoSaveSessions: true,
  providers: [
    {
      id: 'openai',
      name: 'OpenAI',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-••••••••',
      isDefault: true,
      models: [
        { id: 'gpt-5.4', name: 'gpt-5.4', isDefault: true, enabled: true, note: '默认主力模型' },
        { id: 'gpt-5.4-mini', name: 'gpt-5.4-mini', enabled: true, note: '快速处理轻量任务' },
      ],
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-••••••••',
      models: [
        { id: 'claude-sonnet', name: 'claude-sonnet', enabled: true, note: '长文与写作' },
      ],
    },
  ],
  systemPrompt: 'You are Rhythm, a focused coding assistant.',
  permissionMode: 'default',
  allowedTools: ['read', 'shell'],
  deniedTools: ['delete'],
  pathRules: ['allow: C:\\Users\\Administrator\\Documents\\dev\\rhythm\\src'],
  deniedCommands: ['rm -rf', 'del /f /s /q'],
  memoryEnabled: true,
  memoryMaxFiles: 12,
  memoryMaxEntrypointLines: 240,
  hooks: [
    { id: 'hook-1', stage: 'pre_tool_use', type: 'command', matcher: 'shell:*', timeout: 3000, blockOnFailure: false },
    { id: 'hook-2', stage: 'session_end', type: 'http', matcher: 'session:end', timeout: 5000, blockOnFailure: false },
  ],
  mcpServers: [
    { id: 'mcp-1', name: 'filesystem', transport: 'stdio', endpoint: 'npx @modelcontextprotocol/server-filesystem', enabled: true },
    { id: 'mcp-2', name: 'browser', transport: 'http', endpoint: 'http://127.0.0.1:8787/mcp', enabled: false },
  ],
  autoCompactEnabled: true,
  autoCompactThresholdRatio: 0.72,
  autoCompactMaxMicroCompacts: 3,
  enabledPlugins: ['runtime-tools'],
  cronJobs: [
    { id: 'cron-1', name: 'Morning Digest', schedule: 'Every weekday 09:00', prompt: 'Summarize repo changes and open issues.', cwd: 'C:\\Users\\Administrator\\Documents\\dev\\rhythm', enabled: true },
  ],
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

function mapBackendSettings(input: BackendSettings, cronJobs: BackendCronJobConfig[]): AppSettings {
  return {
    theme: input.theme || 'system',
    autoSaveSessions: input.autoSaveSessions ?? true,
    providers: input.providers || [],
    systemPrompt: input.systemPrompt,
    permissionMode: input.permissionMode,
    allowedTools: input.allowedTools,
    deniedTools: input.deniedTools,
    pathRules: input.pathRules,
    deniedCommands: input.deniedCommands,
    memoryEnabled: input.memoryEnabled,
    memoryMaxFiles: input.memoryMaxFiles,
    memoryMaxEntrypointLines: input.memoryMaxEntrypointLines,
    hooks: input.hooks,
    mcpServers: input.mcpServers,
    autoCompactEnabled: input.autoCompactEnabled,
    autoCompactThresholdRatio: input.autoCompactThresholdRatio,
    autoCompactMaxMicroCompacts: input.autoCompactMaxMicroCompacts,
    enabledPlugins: input.enabledPlugins,
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
  return {
    theme: settings.theme,
    autoSaveSessions: settings.autoSaveSessions,
    providers: settings.providers,
    systemPrompt: settings.systemPrompt,
    permissionMode: settings.permissionMode,
    allowedTools: settings.allowedTools,
    deniedTools: settings.deniedTools,
    pathRules: settings.pathRules,
    deniedCommands: settings.deniedCommands,
    memoryEnabled: settings.memoryEnabled,
    memoryMaxFiles: settings.memoryMaxFiles,
    memoryMaxEntrypointLines: settings.memoryMaxEntrypointLines,
    hooks: settings.hooks,
    mcpServers: settings.mcpServers,
    autoCompactEnabled: settings.autoCompactEnabled,
    autoCompactThresholdRatio: settings.autoCompactThresholdRatio,
    autoCompactMaxMicroCompacts: settings.autoCompactMaxMicroCompacts,
    enabledPlugins: settings.enabledPlugins,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      isLoading: false,
      isHydratedFromBackend: false,

      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      setLoading: (loading) => set({ isLoading: loading }),

      hydrateFromBackend: async () => {
        set({ isLoading: true });
        try {
          const [settings, cronJobs] = await Promise.all([fetchBackendSettings(), listCronJobs()]);
          set({
            settings: mapBackendSettings(settings, cronJobs),
            isLoading: false,
            isHydratedFromBackend: true,
          });
        } catch {
          set({ isLoading: false });
        }
      },

      saveToBackend: async () => {
        const current = useSettingsStore.getState().settings;
        await persistBackendSettings(toBackendSettings(current));
      },
    }),
    {
      name: 'rhythm-settings-v2',
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);
