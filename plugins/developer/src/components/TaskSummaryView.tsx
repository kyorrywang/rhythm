import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import type { DeveloperTaskSummary } from '../types';

export function TaskSummaryView({ payload }: WorkbenchProps<DeveloperTaskSummary>) {
  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className="mb-4 rounded-[var(--theme-radius-card)] bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <div className="font-medium text-slate-800">{payload.title}</div>
        <div className="mt-1">Updated {new Date(payload.updatedAt).toLocaleString()}</div>
      </div>

      <section className="mb-4 rounded-[var(--theme-radius-card)] border border-slate-200 bg-white px-4 py-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Latest Command</div>
        {payload.latestLog ? (
          <div className="text-sm text-slate-700">
            <div className="font-medium text-slate-900">{payload.latestLog.command}</div>
            <div className="mt-1 text-xs text-slate-500">
              {payload.latestLog.status === 'running'
                ? 'Running'
                : payload.latestLog.success
                  ? 'Success'
                  : `Failed (${payload.latestLog.exit_code})`}
              {` · ${(payload.latestLog.duration_ms / 1000).toFixed(1)}s`}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No command run yet.</div>
        )}
      </section>

      <section className="mb-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--theme-radius-card)] border border-slate-200 bg-white px-4 py-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Latest Validation</div>
          {payload.latestValidation ? (
            <div className="text-sm text-slate-700">
              <div className="font-medium text-slate-900">{payload.latestValidation.command}</div>
              <div className="mt-1 text-xs text-slate-500">
                {payload.latestValidation.success ? 'Passed' : `${payload.latestValidation.issues.length} issue(s)`}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">No validation run yet.</div>
          )}
        </div>

        <div className="rounded-[var(--theme-radius-card)] border border-slate-200 bg-white px-4 py-4">
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Latest Diff</div>
          {payload.latestDiff ? (
            <div className="text-sm text-slate-700">
              <div className="font-medium text-slate-900">{payload.latestDiff.title}</div>
              <div className="mt-1 text-xs text-slate-500">
                {payload.latestDiff.fileCount} file(s) · +{payload.latestDiff.additions} -{payload.latestDiff.deletions}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">No diff opened yet.</div>
          )}
        </div>
      </section>

      <section className="rounded-[var(--theme-radius-card)] border border-slate-200 bg-white px-4 py-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Changed Files</div>
        {payload.changedFiles.length > 0 ? (
          <div className="space-y-2">
            {payload.changedFiles.map((file) => (
              <div key={`${file.path}:${file.status}`} className="flex items-center justify-between gap-3 rounded-[var(--theme-radius-control)] bg-slate-50 px-3 py-2 text-sm">
                <span className="truncate text-slate-800">{file.path}</span>
                <span className="shrink-0 text-xs text-slate-500">{file.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-500">No changed files.</div>
        )}
      </section>
    </div>
  );
}
