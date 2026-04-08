import type { RhythmPlugin } from './types';

export function definePlugin<TPlugin extends RhythmPlugin>(plugin: TPlugin): TPlugin {
  return plugin;
}
