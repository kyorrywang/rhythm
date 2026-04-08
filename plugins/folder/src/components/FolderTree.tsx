import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilePlus2, Folder, FolderPlus, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { LeftPanelProps } from '../../../../src/plugin/sdk';
import type { BackendWorkspaceDirEntry } from '../../../../src/shared/types/api';
import { Button } from '../../../../src/shared/ui/Button';
import { FOLDER_COMMANDS, FOLDER_VIEWS } from '../constants';
import { useExpandedPaths } from '../hooks/useExpandedPaths';
import { useOpenHistory } from '../hooks/useOpenHistory';
import type { FilePreviewPayload, FolderGitStatusEntry, FolderListInput, FolderReadInput, FolderTreeFileActions } from '../types';
import { basename, dirname, fileStatusDescription, joinPath, sortEntries } from '../utils';
import { FileRow } from './FileRow';
import { TreeNode } from './TreeNode';

export function FolderTree({ ctx, width }: LeftPanelProps) {
  const [rootEntries, setRootEntries] = useState<BackendWorkspaceDirEntry[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitStatuses, setGitStatuses] = useState<Map<string, string>>(new Map());
  const history = useOpenHistory(ctx);
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
      const result = await ctx.commands.execute<FolderReadInput, string | { output?: string }>(
        FOLDER_COMMANDS.read,
        { path: entry.path },
      );
      const content = typeof result === 'string' ? result : result.output || '';
      const file: FilePreviewPayload = {
        path: entry.path,
        content,
        size: content.length,
        truncated: false,
        is_binary: false,
        encoding_error: null,
        limit_bytes: content.length,
      };
      await history.remember(file.path);
      ctx.ui.workbench.open({
        viewId: FOLDER_VIEWS.filePreview,
        title: file.path,
        description: fileStatusDescription(file),
        payload: file,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '无法读取文件'));
    }
  }, [ctx.commands, ctx.ui.workbench, history]);

  const copyPath = useCallback(async (path: string) => {
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

  const revealPath = useCallback(async (path: string) => {
    setError(null);
    try {
      await ctx.commands.execute(FOLDER_COMMANDS.reveal, { path });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError || 'Reveal 失败'));
    }
  }, [ctx.commands]);

  const actions = useMemo<FolderTreeFileActions>(
    () => ({
      openFile: (entry) => void openFile(entry),
      copyPath,
      createFile,
      createDir,
      renamePath,
      deletePath,
      revealPath,
      refreshPath: async () => refreshPath(),
      gitStatusForPath: (path) => gitStatuses.get(path),
    }),
    [copyPath, createDir, createFile, deletePath, gitStatuses, openFile, refreshPath, renamePath, revealPath],
  );

  return (
    <div className="flex h-full shrink-0 flex-col bg-[#f8f7f3]" style={{ width }}>
      <div className="px-4 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
            <Folder size={16} />
            <span>Files</span>
          </div>
          <Button
            variant="unstyled"
            size="none"
            onClick={() => void loadRoot()}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
            title="刷新工作区目录"
          >
            <RefreshCw size={15} />
          </Button>
        </div>
        <h2 className="mt-3 text-[20px] font-semibold text-slate-900">Files</h2>
        <p className="mt-1 truncate text-sm leading-6 text-slate-500">当前工作区</p>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void createFile()}
            className="rounded-xl"
          >
            <FilePlus2 size={14} className="mr-1.5" />
            新建文件
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void createDir()}
            className="rounded-xl"
          >
            <FolderPlus size={14} className="mr-1.5" />
            新建目录
          </Button>
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 focus-within:border-amber-300">
          <Search size={15} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="过滤已展开的文件"
            className="w-full bg-transparent outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {error && (
          <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
            {error}
          </div>
        )}

        {history.entries.length > 0 && (
          <section className="mb-4">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Recent</span>
              <Button
                variant="unstyled"
                size="none"
                onClick={() => void history.clear()}
                className="rounded-lg p-1 text-slate-300 hover:bg-white hover:text-slate-600"
                title="清空最近文件"
              >
                <Trash2 size={12} />
              </Button>
            </div>
            <div className="space-y-1">
              {history.entries.map((entry) => (
                <FileRow
                  key={entry.path}
                  entry={entry}
                  active={activePath === entry.path}
                  depth={0}
                  onOpen={() => void openFile(entry)}
                  onRename={() => void renamePath(entry)}
                  onDelete={() => void deletePath(entry)}
                  onReveal={() => void revealPath(entry.path)}
                  onCopyPath={(path) => void copyPath(path)}
                  gitStatus={gitStatuses.get(entry.path)}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 px-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Workspace</div>
          {isLoading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
              正在读取目录...
            </div>
          )}
          <div className="space-y-1">
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
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              该目录为空
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
