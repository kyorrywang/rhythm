import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilePlus2, Folder, FolderPlus, RefreshCw } from 'lucide-react';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import type { LeftPanelProps } from '../../../../src/plugin/sdk';
import type { BackendWorkspaceDirEntry } from '../../../../src/shared/types/api';
import { Badge, Button, EmptyState, IconButton, NavSectionLabel, SidebarPage } from '../../../../src/shared/ui';
import { themeRecipes } from '../../../../src/shared/theme/recipes';
import { FOLDER_COMMANDS, FOLDER_VIEWS } from '../constants';
import { useExpandedPaths } from '../hooks/useExpandedPaths';
import { readPreviewFile } from '../preview';
import type { FilePreviewPayload, FolderGitStatusEntry, FolderListInput, FolderReadInput, FolderTreeFileActions } from '../types';
import { basename, dirname, formatBytes, joinPath, sortEntries } from '../utils';
import { TreeNode } from './TreeNode';
import { useActiveWorkspace } from '../../../../src/shared/state/useWorkspaceStore';

export function FolderTree({ ctx, width }: LeftPanelProps) {
  const workspace = useActiveWorkspace();
  const [rootEntries, setRootEntries] = useState<BackendWorkspaceDirEntry[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [query, _setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitStatuses, setGitStatuses] = useState<Map<string, string>>(new Map());
  const { expandedPaths, toggle } = useExpandedPaths(ctx);

  const loadRoot = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await ctx.commands.execute<FolderListInput, { entries: BackendWorkspaceDirEntry[] }>(
        FOLDER_COMMANDS.list,
        { path: '.' },
      );
      setRootEntries(sortEntries(result.entries));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '无法读取目录'));
    } finally {
      setIsLoading(false);
    }
  }, [ctx.commands]);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot]);

  useEffect(() => {
    const disposable = ctx.events.on('developer.gitStatusChanged', (payload) => {
      const files = typeof payload === 'object' && payload && 'files' in payload
        ? (payload as { files?: FolderGitStatusEntry[] }).files || []
        : [];
      setGitStatuses(new Map(files.map((entry) => [entry.path, entry.status])));
    });
    return () => disposable.dispose();
  }, [ctx.events]);

  const openFile = useCallback(async (entry: BackendWorkspaceDirEntry) => {
    setActivePath(entry.path);
    setError(null);
    try {
      const file = await readPreviewFile(entry.path);
      ctx.ui.workbench.open({
        viewId: FOLDER_VIEWS.filePreview,
        title: file.path,
        description: `大小 ${formatBytes(file.size)}`,
        payload: file,
        layoutMode: 'replace',
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '无法读取文件'));
    }
  }, [ctx.ui.workbench]);

  const copyPath = useCallback(async (path: string) => {
    const absolutePath = path === '.'
      ? workspace.path
      : `${workspace.path}\\${path.replace(/\//g, '\\')}`;
    await navigator.clipboard.writeText(absolutePath);
  }, [workspace.path]);

  const copyRelativePath = useCallback(async (path: string) => {
    await navigator.clipboard.writeText(path);
  }, []);

  const refreshPath = useCallback(async () => {
    await loadRoot();
  }, [loadRoot]);

  const createFile = useCallback(async (basePath?: string) => {
    const filename = window.prompt('输入新文件名');
    if (!filename) return;
    const nextPath = joinPath(basePath, filename.trim());
    if (!nextPath) return;
    setError(null);
    try {
      await ctx.commands.execute('tool.write_file', { path: nextPath, content: '' });
      await loadRoot();
      await ctx.commands.execute(FOLDER_COMMANDS.openFile, { path: nextPath });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError || '创建文件失败'));
    }
  }, [ctx.commands, loadRoot]);

  const createDir = useCallback(async (basePath?: string) => {
    const dirnameInput = window.prompt('输入新目录名');
    if (!dirnameInput) return;
    const nextPath = joinPath(basePath, dirnameInput.trim());
    if (!nextPath) return;
    setError(null);
    try {
      await ctx.commands.execute(FOLDER_COMMANDS.createDir, { path: nextPath });
      await loadRoot();
      if (basePath) {
        toggle(basePath);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError || '创建目录失败'));
    }
  }, [ctx.commands, loadRoot, toggle]);

  const renamePath = useCallback(async (entry: BackendWorkspaceDirEntry) => {
    const nextName = window.prompt(`重命名 ${entry.name}`, basename(entry.path));
    if (!nextName || nextName.trim() === entry.name) return;
    const nextPath = joinPath(dirname(entry.path), nextName.trim());
    setError(null);
    try {
      await ctx.commands.execute(FOLDER_COMMANDS.rename, {
        from: entry.path,
        to: nextPath,
      });
      if (activePath === entry.path && entry.kind === 'file') {
        setActivePath(nextPath);
      }
      await loadRoot();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError || '重命名失败'));
    }
  }, [activePath, ctx.commands, loadRoot]);

  const deletePath = useCallback(async (entry: BackendWorkspaceDirEntry) => {
    const confirmed = window.confirm(`确认删除${entry.kind === 'directory' ? '目录' : '文件'}“${entry.name}”？`);
    if (!confirmed) return;
    setError(null);
    try {
      if (entry.kind === 'directory') {
        await ctx.commands.execute(FOLDER_COMMANDS.deletePath, { path: entry.path, recursive: true });
      } else {
        await ctx.commands.execute(FOLDER_COMMANDS.deleteFile, { path: entry.path });
      }
      if (activePath === entry.path) {
        setActivePath(null);
      }
      await loadRoot();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError || '删除失败'));
    }
  }, [activePath, ctx.commands, loadRoot]);

  const revealPath = useCallback(async (entry: BackendWorkspaceDirEntry) => {
    setError(null);
    try {
      const targetPath = entry.path === '.'
        ? workspace.path
        : `${workspace.path}\\${entry.path.replace(/\//g, '\\')}`;
      await revealItemInDir(targetPath);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError || 'Reveal 失败'));
    }
  }, [workspace.path]);

  const actions = useMemo<FolderTreeFileActions>(
    () => ({
      openFile: (entry) => void openFile(entry),
      copyPath,
      copyRelativePath,
      createFile,
      createDir,
      renamePath,
      deletePath,
      revealPath,
      refreshPath: async () => refreshPath(),
      gitStatusForPath: (path) => gitStatuses.get(path),
    }),
    [copyPath, copyRelativePath, createDir, createFile, deletePath, gitStatuses, openFile, refreshPath, renamePath, revealPath],
  );

  return (
    <SidebarPage width={width}>
      <div className="px-4 pb-3 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className={`text-[11px] uppercase tracking-[0.18em] ${themeRecipes.eyebrow()}`}>Explorer</div>
          <IconButton onClick={() => void loadRoot()} title="刷新工作区目录">
            <RefreshCw size={15} />
          </IconButton>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void createFile()}
            className="flex-1 shadow-sm"
          >
            <FilePlus2 size={14} className="mr-1.5" />
            新建文件
          </Button>
          <IconButton
            onClick={() => void createDir()}
            title="新建目录"
            className="border border-[var(--theme-border)] bg-[var(--theme-surface)]"
          >
            <FolderPlus size={14} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {error && (
          <div className="px-2">
            <EmptyState title="目录读取失败" description={error} icon={<Folder size={18} />} className="mb-3 py-4" />
          </div>
        )}

        <section>
          <div className="mb-1.5 flex items-center justify-between px-2">
            <NavSectionLabel className="px-0 pt-0 text-[10px] font-bold uppercase tracking-wider text-[var(--theme-text-muted)]">Workspace</NavSectionLabel>
            <Badge tone="muted" className="h-4 px-1 text-[9px]">{rootEntries.length}</Badge>
          </div>
          {isLoading && rootEntries.length === 0 && (
            <div className="py-8 text-center">
              <RefreshCw size={18} className="mx-auto mb-2 animate-spin text-[var(--theme-text-muted)]" />
              <div className="text-xs text-[var(--theme-text-muted)]">加载中...</div>
            </div>
          )}
          <div className="space-y-0.5">
            {rootEntries.map((entry) => (
              <TreeNode
                key={entry.path}
                ctx={ctx}
                entry={entry}
                depth={0}
                activePath={activePath}
                expanded={entry.kind === 'directory' && expandedPaths.has(entry.path)}
                expandedPaths={expandedPaths}
                query={query.trim()}
                actions={actions}
                onToggle={toggle}
              />
            ))}
          </div>
          {!isLoading && rootEntries.length === 0 && !error && (
            <div className="px-2">
              <EmptyState title="空工作区" description="开始创建文件以构建项目。" icon={<Folder size={18} />} className="py-8" />
            </div>
          )}
        </section>
      </div>
    </SidebarPage>
  );
}
