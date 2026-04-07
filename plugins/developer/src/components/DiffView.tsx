import { useMemo, useState } from 'react';
import type { WorkbenchProps } from '../../../../src/plugin-host';
import type { DiffHunk, DiffPayload } from '../types';

export function DiffView({ payload }: WorkbenchProps<DiffPayload>) {
  const [filter, setFilter] = useState('');
  const [collapsedHunks, setCollapsedHunks] = useState<Set<string>>(new Set());
  const files = useMemo(
    () => payload.files.filter((file) => file.path.toLowerCase().includes(filter.trim().toLowerCase())),
    [filter, payload.files],
  );
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <div className="font-medium text-slate-800">{payload.title}</div>
        <div className="mt-1">{files.length} changed file(s) · +{additions} -{deletions}</div>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter files"
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-amber-300"
        />
      </div>
      {files.length > 0 ? (
        <div className="space-y-4">
          {files.map((file) => (
            <div key={file.path} className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700">
                <span className="truncate">{file.path}</span>
                <span className="shrink-0 text-slate-400">+{file.additions} -{file.deletions}</span>
              </div>
              <div className="bg-slate-950 text-xs leading-6 text-slate-100">
                {file.hunks.length > 0 ? file.hunks.map((hunk, index) => {
                  const id = `${file.path}:${index}`;
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
                  <pre className="whitespace-pre-wrap px-4 py-4">{file.diff}</pre>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          当前没有 git diff。
        </div>
      )}
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
