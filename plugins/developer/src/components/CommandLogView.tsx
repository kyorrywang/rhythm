import type { WorkbenchProps } from '../../../../src/plugin-host';
import type { LogPayload } from '../types';

export function CommandLogView({ payload }: WorkbenchProps<LogPayload>) {
  return <CommandLogContent payload={payload} />;
}

export function CommandLogContent({ payload }: { payload: LogPayload }) {
  return (
    <div className="h-full overflow-auto px-5 py-4">
      <CommandSummary payload={payload} />
      <LogBlock title="STDOUT" content={payload.stdout} />
      <LogBlock title="STDERR" content={payload.stderr} tone="error" />
    </div>
  );
}

function CommandSummary({ payload }: { payload: LogPayload }) {
  return (
    <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
      <div className="font-medium text-slate-800">{payload.command}</div>
      <div className="mt-1">
        {payload.success ? 'Success' : `Failed with exit code ${payload.exit_code}`}
        {payload.timed_out ? ' · timed out' : ''}
        {payload.truncated ? ' · output truncated' : ''}
        {` · ${(payload.duration_ms / 1000).toFixed(1)}s`}
      </div>
    </div>
  );
}

function LogBlock({ title, content, tone = 'default' }: { title: string; content?: string; tone?: 'default' | 'error' }) {
  return (
    <section className="mb-4">
      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">{title}</div>
      <pre className={`min-h-[120px] whitespace-pre-wrap rounded-2xl px-4 py-4 text-xs leading-6 ${
        tone === 'error' ? 'bg-rose-950 text-rose-50' : 'bg-slate-950 text-slate-100'
      }`}>
        {content || '无输出'}
      </pre>
    </section>
  );
}
