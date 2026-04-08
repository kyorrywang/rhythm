import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, RefreshCw } from 'lucide-react';
import { Button } from '../../../../src/shared/ui';
import type { LeftPanelProps } from '../../../../src/plugin/sdk';
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
        variant="tree"
        onOpen={() => actions.openFile(entry)}
        onRename={() => void actions.renamePath(entry)}
        onDelete={() => void actions.deletePath(entry)}
        onReveal={() => void actions.revealPath(entry.path)}
        onCopyPath={(path) => void actions.copyPath(path)}
        gitStatus={actions.gitStatusForPath(entry.path)}
      />
    );
  }

  const isVisible = !query || matchesEntry(entry, query) || filteredChildren.length > 0;
  if (!isVisible) return null;

  const active = activePath === entry.path;

  return (
    <div>
      <div
        className={`group relative flex items-center justify-between gap-1 rounded-md py-1 pr-1 transition-colors ${
          active ? 'bg-[var(--theme-surface-muted)]' : 'hover:bg-[var(--theme-surface-subtle)]'
        }`}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <Button
          variant="unstyled"
          size="none"
          onClick={() => onToggle(entry.path)}
          className="min-w-0 flex-1 justify-start text-left focus:ring-0"
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <span className="flex w-4 shrink-0 items-center justify-center">
              {expanded ? (
                <ChevronDown size={14} className="text-[var(--theme-text-muted)]" />
              ) : (
                <ChevronRight size={14} className="text-[var(--theme-text-muted)]" />
              )}
            </span>
            {expanded ? (
              <FolderOpen
                size={14}
                className="shrink-0 text-[var(--theme-text-muted)]"
              />
            ) : (
              <Folder
                size={14}
                className="shrink-0 text-[var(--theme-text-muted)]"
              />
            )}
            <span className={`truncate text-sm ${active ? 'font-semibold text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-text-primary)]'}`}>
              {entry.name}
            </span>
          </span>
        </Button>
        <span className="flex items-center gap-0.5">
          <ActionMenu
            entry={entry}
            onCopyPath={(path) => void actions.copyPath(path)}
            onCreateFile={(basePath) => void actions.createFile(basePath)}
            onCreateDir={(basePath) => void actions.createDir(basePath)}
            onRename={() => void actions.renamePath(entry)}
            onDelete={() => void actions.deletePath(entry)}
            onReveal={() => void actions.revealPath(entry.path)}
            onRefresh={() => void actions.refreshPath(entry.path)}
          />
        </span>
      </div>
      {expanded && (
        <div className="space-y-0.5">
          {isLoading && (
            <div className="py-1 text-[10px] text-[var(--theme-text-muted)]" style={{ paddingLeft: 32 + depth * 16 }}>
              正在展开...
            </div>
          )}
          {error && (
            <div className="py-1 text-[10px] text-[var(--theme-danger)]" style={{ paddingLeft: 32 + depth * 16 }}>
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
