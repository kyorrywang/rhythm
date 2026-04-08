import { CheckCircle2, Play, Square } from 'lucide-react';
import { Button } from '../../../../src/shared/ui/Button';

export function CommandRunner({
  command,
  isRunning,
  error,
  onCommandChange,
  onRun,
  onValidate,
  onCancel,
}: {
  command: string;
  isRunning: boolean;
  error: string | null;
  onCommandChange: (command: string) => void;
  onRun: () => void;
  onValidate: () => void;
  onCancel: () => void;
}) {
  return (
    <section>
      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Command</div>
      <textarea
        value={command}
        onChange={(event) => onCommandChange(event.target.value)}
        className="min-h-[86px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 font-mono text-xs leading-5 text-slate-700 outline-none focus:border-amber-300"
      />
      {error && (
        <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {error}
        </div>
      )}
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <Button variant="primary" size="sm" onClick={onRun} disabled={isRunning} className="justify-center rounded-2xl">
          <Play size={14} />
          {isRunning ? 'Running...' : 'Run'}
        </Button>
        <Button variant="secondary" size="sm" onClick={onValidate} disabled={isRunning} className="justify-center rounded-2xl">
          <CheckCircle2 size={14} />
          Validate
        </Button>
      </div>
      {isRunning && (
        <div className="mt-2">
          <Button variant="ghost" size="sm" onClick={onCancel} className="justify-center rounded-2xl">
            <Square size={14} />
            Cancel
          </Button>
        </div>
      )}
    </section>
  );
}
