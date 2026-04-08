import { useCallback, useEffect, useState } from 'react';
import type { PluginContext } from '../../../../src/plugin/sdk';
import { DEVELOPER_STORAGE_KEYS, MAX_COMMAND_HISTORY } from '../constants';
import type { LogPayload } from '../types';

export function useCommandHistory(ctx: PluginContext) {
  const [entries, setEntries] = useState<LogPayload[]>([]);

  useEffect(() => {
    let cancelled = false;
    void ctx.storage.get<LogPayload[]>(DEVELOPER_STORAGE_KEYS.commandHistory).then((items) => {
      if (!cancelled) setEntries(items || []);
    });
    return () => {
      cancelled = true;
    };
  }, [ctx.storage]);

  const remember = useCallback(async (payload: LogPayload) => {
    const next = [payload, ...entries.filter((item) => item.command !== payload.command)].slice(0, MAX_COMMAND_HISTORY);
    setEntries(next);
    await ctx.storage.set(DEVELOPER_STORAGE_KEYS.commandHistory, next);
  }, [ctx.storage, entries]);

  const clear = useCallback(async () => {
    setEntries([]);
    await ctx.storage.set(DEVELOPER_STORAGE_KEYS.commandHistory, []);
  }, [ctx.storage]);

  return { entries, remember, clear };
}
