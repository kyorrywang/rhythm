import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LeftPanelProps } from '../../../../src/plugin/sdk';
import { FOLDER_STORAGE_KEYS, MAX_OPEN_HISTORY } from '../constants';
import { basename } from '../utils';

export function useOpenHistory(ctx: LeftPanelProps['ctx']) {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void ctx.storage.get<string[]>(FOLDER_STORAGE_KEYS.openHistory).then((stored) => {
      if (!cancelled) setHistory(stored || []);
    });
    return () => {
      cancelled = true;
    };
  }, [ctx.storage]);

  const remember = useCallback(async (path: string) => {
    const nextHistory = [path, ...history.filter((item) => item !== path)].slice(0, MAX_OPEN_HISTORY);
    setHistory(nextHistory);
    await ctx.storage.set(FOLDER_STORAGE_KEYS.openHistory, nextHistory);
  }, [ctx.storage, history]);

  const clear = useCallback(async () => {
    setHistory([]);
    await ctx.storage.delete(FOLDER_STORAGE_KEYS.openHistory);
  }, [ctx.storage]);

  const entries = useMemo(
    () => history.map((path) => ({
      name: basename(path),
      path,
      kind: 'file' as const,
    })),
    [history],
  );

  return { history, entries, remember, clear };
}
