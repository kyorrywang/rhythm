import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import type { ValidationPayload } from '../types';
import { CommandLogContent } from './CommandLogView';

export function ValidationView({ ctx, payload }: WorkbenchProps<ValidationPayload>) {
  const revealIssue = async (file?: string) => {
    if (!file) return;
    const issue = payload.issues.find((candidate) => candidate.file === file);
    await ctx.commands.execute('folder.openFile', {
      path: file,
      line: issue?.line,
      column: issue?.column,
    });
  };

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${payload.success ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
        <div className="flex items-center gap-2 font-semibold">
          {payload.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{payload.success ? 'Validation passed' : 'Validation failed'}</span>
        </div>
        <div className="mt-1 text-xs">{payload.command} · exit {payload.exitCode} · {(payload.durationMs / 1000).toFixed(1)}s</div>
      </div>
      <section className="mb-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Issues</div>
        {payload.issues.length > 0 ? (
          <div className="space-y-2">
            {payload.issues.map((issue, index) => (
              <div key={index} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <div className={issue.severity === 'error' ? 'text-rose-700' : 'text-amber-700'}>{issue.message}</div>
                {issue.file && (
                  <button className="mt-1 text-left text-xs text-slate-500 hover:text-slate-900" onClick={() => void revealIssue(issue.file)}>
                    {issue.file}{issue.line ? `:${issue.line}` : ''}{issue.column ? `:${issue.column}` : ''}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            没有解析到结构化问题，详见日志。
          </div>
        )}
      </section>
      <CommandLogContent payload={payload.log} />
    </div>
  );
}
