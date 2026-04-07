import { Trash2 } from 'lucide-react';
import { Button } from '../../../../src/shared/ui/Button';
import type { LogPayload } from '../types';

export function RecentLogs({
  entries,
  onOpen,
  onClear,
}: {
  entries: LogPayload[];
  onOpen: (entry: LogPayload) => void;
  onClear: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Recent Logs</span>
        {entries.length > 0 && (
          <Button
            variant="unstyled"
            size="none"
            onClick={onClear}
            className="rounded-lg p-1 text-slate-300 hover:bg-white hover:text-slate-600"
            title="清空最近日志"
          >
            <Trash2 size={12} />
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {entries.length > 0 ? entries.map((result, index) => (
          <Button
            key={`${result.command}-${index}`}
            variant="unstyled"
            size="none"
            onClick={() => onOpen(result)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-xs text-slate-600 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-slate-800">{result.command}</span>
              <span className={result.success ? 'text-emerald-600' : 'text-rose-600'}>{result.success ? 'ok' : result.exit_code}</span>
            </div>
          </Button>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">
            暂无命令结果
          </div>
        )}
      </div>
    </section>
  );
}
