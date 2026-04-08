import { useMemo, useState } from 'react';
import { Button } from '../../../../src/shared/ui/Button';
import type { ValidationPayload } from '../types';

export function ValidationHistory({
  entries,
  onOpen,
  onClear,
}: {
  entries: ValidationPayload[];
  onOpen: (entry: ValidationPayload) => void;
  onClear: () => void;
}) {
  if (entries.length === 0) return null;
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const matchesText =
          !filter.trim()
          || entry.command.toLowerCase().includes(filter.trim().toLowerCase())
          || entry.issues.some((issue) => issue.message.toLowerCase().includes(filter.trim().toLowerCase()));
        const matchesStatus =
          statusFilter === 'all'
          || (statusFilter === 'passed' ? entry.success : !entry.success);
        return matchesText && matchesStatus;
      }),
    [entries, filter, statusFilter],
  );

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Validation History</span>
        <Button
          variant="unstyled"
          size="none"
          onClick={onClear}
          className="rounded-lg p-1 text-slate-300 hover:bg-white hover:text-slate-600"
          title="清空 validation 历史"
        >
          clear
        </Button>
      </div>
      <div className="mb-3 space-y-2">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter validations"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-amber-300"
        />
        <div className="flex gap-2 text-[11px]">
          {(['all', 'passed', 'failed'] as const).map((value) => (
            <Button
              key={value}
              variant="unstyled"
              size="none"
              onClick={() => setStatusFilter(value)}
              className={`rounded-full px-2 py-1 ${
                statusFilter === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'
              }`}
            >
              {value}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {filteredEntries.map((entry, index) => (
          <Button
            key={`${entry.command}-${index}`}
            variant="unstyled"
            size="none"
            onClick={() => onOpen(entry)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-xs text-slate-600 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-slate-800">{entry.command}</span>
              <span className={entry.success ? 'text-emerald-600' : 'text-rose-600'}>
                {entry.success ? 'ok' : `${entry.issues.length} issue(s)`}
              </span>
            </div>
          </Button>
        ))}
        {filteredEntries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">
            没有匹配的 validation 记录
          </div>
        )}
      </div>
    </section>
  );
}
