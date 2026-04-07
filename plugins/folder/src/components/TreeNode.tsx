import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, RefreshCw } from 'lucide-react';
import { Button } from '../../../../src/shared/ui/Button';
import type { LeftPanelProps } from '../../../../src/plugin-host';
import type { BackendWorkspaceDirEntry } from '../../../../src/shared/types/api';
import { FOLDER_COMMANDS } from '../constants';
import type { FolderListInput, FolderTreeFileActions } from '../types';
import { matchesEntry, sortEntries } from '../utils';
import { ActionMenu } from './ActionMenu';
import { FileRow } from './FileRow';

export function TreeNode({
  ctx,
  entry,
  depth,
  activePath,
  expanded,
  expandedPaths,
  query,
  actions,
  onToggle,
}: {
  ctx: LeftPanelProps['ctx'];
  entry: BackendWorkspaceDirEntry;
  depth: number;
  activePath: string | null;
  expanded: boolean;
  expandedPaths: Set<string>;
  query: string;
  actions: FolderTreeFileActions;
  onToggle: (path: string) => void;
}) {
  const [children, setChildren] = useState<BackendWorkspaceDirEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChildren = useCallback(async (force = false) => {
    if (entry.kind !== 'directory') return;
    if (!force && children.length > 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await ctx.commands.execute<FolderListInput, { entries: BackendWorkspaceDirEntry[] }>(
        FOLDER_COMMANDS.list,
        { path: entry.path },
      );
      setChildren(sortEntries(result.entries));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '无法读取目录'));
    } finally {
      setIsLoading(false);
    }
  }, [children.length, ctx.commands, entry.kind, entry.path]);

  useEffect(() => {
    if (!expanded) return;
    void loadChildren();
  }, [expanded, loadChildren]);

  const filteredChildren = useMemo(
    () => children.filter((child) => matchesEntry(child, query)),
    [children, query],
  );

  if (entry.kind === 'file') {
    if (!matchesEntry(entry, query)) return null;
    return (
      <FileRow
        entry={entry}
        active={activePath === entry.path}
        depth={depth}
        onOpen={() => actions.openFile(entry)}
        onCopyPath={(path) => void actions.copyPath(path)}
        gitStatus={actions.gitStatusForPath(entry.path)}
      />
    );
  }

  const isVisible = !query || matchesEntry(entry, query) || filteredChildren.length > 0;
  if (!isVisible) return null;

  return (
    <div>
      <Button
        variant="unstyled"
        size="none"
        onClick={() => onToggle(entry.path)}
        className="group flex w-full items-center justify-between rounded-2xl py-2 pr-2 text-left text-sm text-slate-700 transition-colors hover:bg-white"
        style={{ paddingLeft: 12 + depth * 14 }}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} className="shrink-0" />
          <span className="truncate">{entry.name}</span>
        </span>
        <span className="flex items-center gap-1">
          {expanded && (
            <Button
              variant="unstyled"
              size="none"
              onClick={(event) => {
                event.stopPropagation();
                void loadChildren(true);
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
              title="刷新目录"
            >
              <RefreshCw size={13} />
            </Button>
          )}
          <ActionMenu path={entry.path} onCopyPath={(path) => void actions.copyPath(path)} />
        </span>
      </Button>
      {expanded && (
        <div className="space-y-1">
          {isLoading && (
            <div className="py-1 text-xs text-slate-400" style={{ paddingLeft: 36 + depth * 14 }}>
              正在展开...
            </div>
          )}
          {error && (
            <div className="py-1 text-xs text-rose-600" style={{ paddingLeft: 36 + depth * 14 }}>
              {error}
            </div>
          )}
          {filteredChildren.map((child) => (
            <TreeNode
              key={child.path}
              ctx={ctx}
              entry={child}
              depth={depth + 1}
              activePath={activePath}
              expanded={child.kind === 'directory' && expandedPaths.has(child.path)}
              expandedPaths={expandedPaths}
              query={query}
              actions={actions}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
