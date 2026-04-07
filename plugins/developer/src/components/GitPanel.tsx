import { ExternalLink, FileCode2, GitBranch } from 'lucide-react';
import { Button } from '../../../../src/shared/ui/Button';
import type { GitStatusEntry, LogPayload } from '../types';

export function GitPanel({
  gitStatus,
  changedFiles,
  onRefreshStatus,
  onOpenDiff,
  onOpenStagedDiff,
  onOpenFileDiff,
  onRevealFile,
  onStageFile,
  onUnstageFile,
  onCommit,
}: {
  gitStatus: LogPayload | null;
  changedFiles: GitStatusEntry[];
  onRefreshStatus: () => void;
  onOpenDiff: () => void;
  onOpenStagedDiff: () => void;
  onOpenFileDiff: (path: string) => void;
  onRevealFile: (path: string) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onCommit: () => void;
}) {
  return (
    <section>
      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Git</div>
      <div className="grid gap-2">
        <Button variant="unstyled" size="none" onClick={onRefreshStatus} className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50">
          <GitBranch size={14} />
          <span>Open git status</span>
        </Button>
        <Button variant="unstyled" size="none" onClick={onOpenDiff} className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50">
          <FileCode2 size={14} />
          <span>Open git diff</span>
        </Button>
        <Button variant="unstyled" size="none" onClick={onOpenStagedDiff} className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50">
          <FileCode2 size={14} />
          <span>Open staged diff</span>
        </Button>
        <Button variant="unstyled" size="none" onClick={onCommit} className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50">
          <GitBranch size={14} />
          <span>Commit staged changes</span>
        </Button>
      </div>
      {gitStatus && (
        <div className="mt-2 rounded-2xl bg-white px-3 py-2 text-xs text-slate-500">
          {gitStatus.stdout.trim() || 'Working tree clean'}
        </div>
      )}
      {changedFiles.length > 0 && (
        <div className="mt-3 space-y-2">
          {changedFiles.map((file) => (
            <div key={`${file.status}-${file.path}`} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <span className="w-8 shrink-0 font-mono text-slate-400">{file.status}</span>
              <button className="min-w-0 flex-1 truncate text-left hover:text-slate-900" onClick={() => onOpenFileDiff(file.path)}>
                {file.path}
              </button>
              <button className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => onStageFile(file.path)} title="Stage file">
                stage
              </button>
              <button className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => onUnstageFile(file.path)} title="Unstage file">
                unstage
              </button>
              <button className="shrink-0 rounded-lg p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-700" onClick={() => onRevealFile(file.path)} title="Reveal in file manager">
                <ExternalLink size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
