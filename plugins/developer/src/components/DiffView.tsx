import { useMemo, useState } from 'react';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import type { DiffHunk, DiffPayload } from '../types';

export function DiffView({ ctx, payload }: WorkbenchProps<DiffPayload>) {
  const [filter, setFilter] = useState('');
  const [collapsedHunks, setCollapsedHunks] = useState<Set<string>>(new Set());
  const [activeFile, setActiveFile] = useState<string | null>(payload.files[0]?.path || null);
  const files = useMemo(
    () => payload.files.filter((file) => file.path.toLowerCase().includes(filter.trim().toLowerCase())),
    [filter, payload.files],
  );
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const currentFile = files.find((file) => file.path === activeFile) || files[0] || null;

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-slate-50 px-4 py-4">
        <div className="rounded-2xl bg-white px-4 py-3 text-xs text-slate-500">
          <div className="font-medium text-slate-800">{payload.title}</div>
          <div className="mt-1">{files.length} changed file(s) · +{additions} -{deletions}</div>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter files"
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-amber-300"
          />
        </div>
        <div className="mt-4 space-y-2 overflow-auto">
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => setActiveFile(file.path)}
              className={`w-full rounded-2xl border px-3 py-3 text-left text-xs ${
                currentFile?.path === file.path
                  ? 'border-amber-300 bg-amber-50 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="truncate font-medium">{file.path}</div>
              <div className="mt-1 text-[11px] text-slate-400">+{file.additions} -{file.deletions}</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-auto px-5 py-4">
        {currentFile ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700">
              <span className="truncate">{currentFile.path}</span>
              <div className="flex items-center gap-3">
                <button
                  className="text-slate-500 hover:text-slate-900"
                  onClick={() => void ctx.commands.execute('folder.openFile', { path: currentFile.path })}
                >
                  Open
                </button>
                <span className="shrink-0 text-slate-400">+{currentFile.additions} -{currentFile.deletions}</span>
              </div>
            </div>
            <div className="bg-slate-950 text-xs leading-6 text-slate-100">
              {currentFile.hunks.length > 0 ? currentFile.hunks.map((hunk, index) => {
                  const id = `${currentFile.path}:${index}`;
                  const collapsed = collapsedHunks.has(id);
                  return (
                    <DiffHunkBlock
                      key={id}
                      hunk={hunk}
                      collapsed={collapsed}
                      onToggle={() => setCollapsedHunks((current) => {
                        const next = new Set(current);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })}
                    />
                  );
                }) : (
                  <pre className="whitespace-pre-wrap px-4 py-4">{currentFile.diff}</pre>
                )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
            当前没有 git diff。
          </div>
        )}
      </div>
    </div>
  );
}

function DiffHunkBlock({
  hunk,
  collapsed,
  onToggle,
}: {
  hunk: DiffHunk;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="border-b border-slate-800 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 bg-slate-900 px-4 py-2 text-left text-[11px] text-slate-300 hover:bg-slate-800"
      >
        <span className="truncate font-mono">{hunk.header}</span>
        <span className="shrink-0 text-slate-500">+{hunk.additions} -{hunk.deletions} · {collapsed ? 'expand' : 'collapse'}</span>
      </button>
      {!collapsed && (
        <pre className="whitespace-pre-wrap px-4 py-3">
          {hunk.lines.map((line, index) => (
            <div key={index} className={lineClassName(line)}>{line || ' '}</div>
          ))}
        </pre>
      )}
    </section>
  );
}

function lineClassName(line: string) {
  if (line.startsWith('+')) return 'text-emerald-300';
  if (line.startsWith('-')) return 'text-rose-300';
  return 'text-slate-200';
}
