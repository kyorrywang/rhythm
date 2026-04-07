import { Button } from '../../../../src/shared/ui/Button';
import type { ValidationPayload } from '../types';

export function ValidationHistory({
  entries,
  onOpen,
}: {
  entries: ValidationPayload[];
  onOpen: (entry: ValidationPayload) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <section>
      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Validation History</div>
      <div className="space-y-2">
        {entries.map((entry, index) => (
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
      </div>
    </section>
  );
}
