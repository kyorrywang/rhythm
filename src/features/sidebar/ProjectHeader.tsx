import { FileEdit } from 'lucide-react';
import { Button } from '@/shared/ui/Button';

interface ProjectHeaderProps {
  workspaceName: string;
  workspacePath: string;
  onNewSession: () => void;
}

export const ProjectHeader = ({ workspaceName, workspacePath, onNewSession }: ProjectHeaderProps) => {
  return (
    <div className="px-4 pb-4 pt-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex-1 overflow-hidden">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Workspace</div>
          <h2 className="mt-2 text-[22px] font-semibold leading-tight text-slate-900">{workspaceName}</h2>
          <p className="mt-1 truncate text-[12px] text-slate-500" title={workspacePath}>{workspacePath}</p>
        </div>
      </div>

      <Button
        variant="unstyled"
        size="none"
        onClick={onNewSession}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] font-medium text-slate-700 shadow-[0_10px_25px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <FileEdit size={14} opacity={0.7} />
        新建会话
      </Button>
    </div>
  );
};
