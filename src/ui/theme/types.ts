export type ThemePresetName = 'grand' | 'refined';

export interface ThemeDefinition {
  name: ThemePresetName;
  label: string;
  vars: Record<string, string>;
}
