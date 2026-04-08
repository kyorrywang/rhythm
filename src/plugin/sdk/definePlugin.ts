import type { RhythmPlugin as HostRhythmPlugin } from '../host/types';
import type { RhythmPlugin } from './types';

export function definePlugin<TPlugin extends RhythmPlugin>(plugin: TPlugin): TPlugin & HostRhythmPlugin {
  return plugin as TPlugin & HostRhythmPlugin;
}
