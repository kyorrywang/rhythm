import { useCallback, useEffect, useState } from 'react';
import type { PluginContext } from '../../../../src/plugin/sdk';
import { DEVELOPER_STORAGE_KEYS, MAX_VALIDATION_HISTORY } from '../constants';
import type { ValidationPayload } from '../types';

export function useValidationHistory(ctx: PluginContext) {
  const [entries, setEntries] = useState<ValidationPayload[]>([]);

  useEffect(() => {
    let cancelled = false;
    void ctx.storage.get<ValidationPayload[]>(DEVELOPER_STORAGE_KEYS.validationHistory).then((items) => {
      if (!cancelled) setEntries(items || []);
    });
    return () => {
      cancelled = true;
    };
  }, [ctx.storage]);

  const remember = useCallback(async (payload: ValidationPayload) => {
    const next = [payload, ...entries.filter((item) => item.command !== payload.command)].slice(0, MAX_VALIDATION_HISTORY);
    setEntries(next);
    await ctx.storage.set(DEVELOPER_STORAGE_KEYS.validationHistory, next);
    await ctx.storage.set(DEVELOPER_STORAGE_KEYS.latestValidation, payload);
  }, [ctx.storage, entries]);

  const clear = useCallback(async () => {
    setEntries([]);
    await ctx.storage.set(DEVELOPER_STORAGE_KEYS.validationHistory, []);
  }, [ctx.storage]);

  return { entries, remember, clear };
}
