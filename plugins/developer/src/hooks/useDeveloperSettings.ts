import { useCallback, useEffect, useState } from 'react';
import type { PluginContext } from '../../../../src/plugin/sdk';
import { DEFAULT_VALIDATION_COMMANDS, DEVELOPER_STORAGE_KEYS } from '../constants';
import type { DeveloperSettings } from '../types';
import { defaultDeveloperSettings } from '../utils';

export function useDeveloperSettings(ctx: PluginContext) {
  const [settings, setSettings] = useState<DeveloperSettings>(defaultDeveloperSettings(DEFAULT_VALIDATION_COMMANDS));

  useEffect(() => {
    let cancelled = false;
    void ctx.storage.get<DeveloperSettings>(DEVELOPER_STORAGE_KEYS.settings).then((stored) => {
      if (cancelled) return;
      setSettings(stored || defaultDeveloperSettings(DEFAULT_VALIDATION_COMMANDS));
    });
    return () => {
      cancelled = true;
    };
  }, [ctx.storage]);

  const update = useCallback(async (patch: Partial<DeveloperSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void ctx.storage.set(DEVELOPER_STORAGE_KEYS.settings, next);
      return next;
    });
  }, [ctx.storage]);

  return { settings, update };
}
