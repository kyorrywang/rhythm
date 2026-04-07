import { ScrollText } from 'lucide-react';
import { Button } from '../../../../src/shared/ui/Button';

export function ValidationPresets({
  commands,
  onRun,
}: {
  commands: string[];
  onRun: (command: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Suggested Validations</div>
      <div className="space-y-2">
        {commands.map((item) => (
          <Button
            key={item}
            variant="unstyled"
            size="none"
            onClick={() => onRun(item)}
            className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
          >
            <ScrollText size={14} />
            <span className="truncate">{item}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}
