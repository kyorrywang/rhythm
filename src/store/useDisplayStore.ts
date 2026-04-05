import { create } from 'zustand';

export type ExpandMode = 'expand' | 'collapse';

export interface SegmentDisplayConfig {
  whileRunning: ExpandMode;
  whenDone: ExpandMode;
}

export interface DisplayPreferences {
  thinking: SegmentDisplayConfig;
  toolCall: SegmentDisplayConfig;
  ask: SegmentDisplayConfig;
}

const DEFAULT_PREFERENCES: DisplayPreferences = {
  thinking: { whileRunning: 'expand', whenDone: 'expand' },
  toolCall: { whileRunning: 'expand', whenDone: 'expand' },
  ask: { whileRunning: 'collapse', whenDone: 'expand' },
};

const STORAGE_KEY = 'rhythm-display-preferences-v1';

function loadPreferences(): DisplayPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PREFERENCES;
}

function savePreferences(prefs: DisplayPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

interface DisplayState {
  preferences: DisplayPreferences;
  setSegmentConfig: <K extends keyof DisplayPreferences>(
    segment: K,
    config: SegmentDisplayConfig
  ) => void;
  resetToDefaults: () => void;
}

export const useDisplayStore = create<DisplayState>((set) => ({
  preferences: loadPreferences(),

  setSegmentConfig: (segment, config) =>
    set((state) => {
      const next = {
        ...state.preferences,
        [segment]: config,
      };
      savePreferences(next);
      return { preferences: next };
    }),

  resetToDefaults: () => {
    savePreferences(DEFAULT_PREFERENCES);
    return { preferences: DEFAULT_PREFERENCES };
  },
}));
