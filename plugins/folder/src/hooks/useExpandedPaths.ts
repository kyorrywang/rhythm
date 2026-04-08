import { useCallback, useEffect, useState } from 'react';
import type { LeftPanelProps } from '../../../../src/plugin/sdk';
import { FOLDER_STORAGE_KEYS } from '../constants';

export function useExpandedPaths(ctx: LeftPanelProps['ctx']) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(['.']));

  useEffect(() => {
    let cancelled = false;
    void ctx.storage.get<string[]>(FOLDER_STORAGE_KEYS.expandedPaths).then((stored) => {
      if (!cancelled && stored) setExpandedPaths(new Set(['.', ...stored]));
    });
    return () => {
      cancelled = true;
    };
  }, [ctx.storage]);

  const persist = useCallback(async (next: Set<string>) => {
    await ctx.storage.set(FOLDER_STORAGE_KEYS.expandedPaths, [...next].filter((path) => path !== '.'));
  }, [ctx.storage]);

  const toggle = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      void persist(next);
      return next;
    });
  }, [persist]);

  return { expandedPaths, toggle };
}
