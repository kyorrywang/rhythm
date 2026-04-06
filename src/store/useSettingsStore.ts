import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  autoSaveSessions: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  autoSaveSessions: true,
};

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
  setLoading: (loading: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      isLoading: false,

      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'rhythm-settings-v1',
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);
