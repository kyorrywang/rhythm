import { create } from 'zustand';
import {
  disablePlugin,
  enablePlugin,
  grantPluginPermission,
  listPlugins,
  revokePluginPermission,
} from '@/shared/api/commands';
import type { BackendPluginSummary } from '@/shared/types/api';

interface PluginState {
  plugins: BackendPluginSummary[];
  isLoading: boolean;
  error: string | null;
  fetchPlugins: (cwd: string) => Promise<void>;
  togglePlugin: (cwd: string, name: string, enabled: boolean) => Promise<void>;
  setPluginPermission: (cwd: string, name: string, permission: string, granted: boolean) => Promise<void>;
}

export const usePluginStore = create<PluginState>((set) => ({
  plugins: [],
  isLoading: false,
  error: null,

  fetchPlugins: async (cwd) => {
    set({ isLoading: true, error: null });
    try {
      const plugins = await listPlugins(cwd);
      set({ plugins, isLoading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '加载插件失败', isLoading: false });
    }
  },

  togglePlugin: async (cwd, name, enabled) => {
    if (enabled) {
      await enablePlugin(name);
    } else {
      await disablePlugin(name);
    }
    const plugins = await listPlugins(cwd);
    set({ plugins });
  },

  setPluginPermission: async (cwd, name, permission, granted) => {
    if (granted) {
      await grantPluginPermission(name, permission, cwd);
    } else {
      await revokePluginPermission(name, permission, cwd);
    }
    const plugins = await listPlugins(cwd);
    set({ plugins });
  },
}));
