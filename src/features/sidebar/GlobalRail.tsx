import { Plus, Puzzle, Settings2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface GlobalRailProps {
  activeMode: 'sessions' | 'plugins' | 'settings';
  isCollapsed: boolean;
  onWorkspaceClick: () => void;
  onAddWorkspace: () => void;
  onOpenPlugins: () => void;
  onOpenSettings: () => void;
}

export const GlobalRail = ({
  activeMode,
  isCollapsed,
  onWorkspaceClick,
  onAddWorkspace,
  onOpenPlugins,
  onOpenSettings,
}: GlobalRailProps) => {
  return (
    <div className="w-[64px] border-r border-slate-200 bg-[linear-gradient(180deg,#f7f4ed_0%,#f3efe6_100%)] flex flex-col items-center py-4">
      <div className="flex flex-col gap-3">
        <button
          onClick={onWorkspaceClick}
          title={isCollapsed ? '展开工作区' : '收起工作区'}
          className={cn(
            'relative flex h-10 w-10 items-center justify-center rounded-2xl border text-sm font-semibold transition-all',
            activeMode === 'sessions'
              ? 'border-amber-300 bg-white text-amber-900 shadow-[0_10px_24px_rgba(146,93,24,0.12)]'
              : 'border-transparent bg-white/70 text-slate-500 hover:border-amber-200 hover:text-slate-800',
          )}
        >
          R
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-white" />
        </button>
        <button
          onClick={onAddWorkspace}
          title="添加工作区"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-transparent bg-white/60 text-slate-500 transition-colors hover:border-slate-200 hover:text-slate-800"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <button
          onClick={onOpenPlugins}
          title="插件"
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-2xl transition-colors',
            activeMode === 'plugins'
              ? 'bg-slate-900 text-white shadow-[0_8px_20px_rgba(15,23,42,0.2)]'
              : 'bg-white/60 text-slate-500 hover:bg-white hover:text-slate-800',
          )}
        >
          <Puzzle size={18} />
        </button>
        <button
          onClick={onOpenSettings}
          title="设置"
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-2xl transition-colors',
            activeMode === 'settings'
              ? 'bg-slate-900 text-white shadow-[0_8px_20px_rgba(15,23,42,0.2)]'
              : 'bg-white/60 text-slate-500 hover:bg-white hover:text-slate-800',
          )}
        >
          <Settings2 size={18} />
        </button>
      </div>
    </div>
  );
};
