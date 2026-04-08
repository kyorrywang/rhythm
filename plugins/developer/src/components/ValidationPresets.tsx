import { ScrollText } from 'lucide-react';
import { Button } from '../../../../src/shared/ui/Button';
import type { ValidationPreset } from '../types';

export function ValidationPresets({
  presets,
  onRun,
}: {
  presets: ValidationPreset[];
  onRun: (command: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Suggested Validations</div>
      <div className="space-y-2">
        {presets.map((item) => (
          <Button
            key={item.id}
            variant="unstyled"
            size="none"
            onClick={() => onRun(item.command)}
            className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
          >
            <ScrollText size={14} />
            <span className="truncate">{item.label}</span>
            <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
              {item.kind}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
