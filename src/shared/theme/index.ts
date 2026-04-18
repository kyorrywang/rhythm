import { grandTheme } from './presets/grand';
import { refinedTheme } from './presets/refined';
import type { ThemeDefinition, ThemePresetName } from './types';

export type { ThemeDefinition, ThemePresetName } from './types';

export const themePresets: Record<ThemePresetName, ThemeDefinition> = {
  grand: grandTheme,
  refined: refinedTheme,
};

export function getThemePreset(name: ThemePresetName): ThemeDefinition {
  return themePresets[name];
}

