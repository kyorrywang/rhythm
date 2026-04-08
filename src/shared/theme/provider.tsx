import { useEffect, type ReactNode } from 'react';
import { useSettingsStore } from '@/shared/state/useSettingsStore';
import { getThemePreset } from './index';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themePreset = useSettingsStore((state) => state.settings.themePreset);

  useEffect(() => {
    const preset = getThemePreset(themePreset);
    const root = document.documentElement;

    for (const [key, value] of Object.entries(preset.vars)) {
      root.style.setProperty(key, value);
    }
    root.dataset.rhythmThemePreset = preset.name;

    return () => {
      for (const key of Object.keys(preset.vars)) {
        root.style.removeProperty(key);
      }
      delete root.dataset.rhythmThemePreset;
    };
  }, [themePreset]);

  return <>{children}</>;
}
