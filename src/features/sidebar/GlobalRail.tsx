import { Code2, FolderTree, Globe, Plus, Puzzle, Settings2, Workflow } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import type { Workspace } from '@/shared/state/useWorkspaceStore';
import type { ActivityBarContribution } from '@/plugin-host/types';

interface GlobalRailProps {
  activeMode: string;
  isCollapsed: boolean;
  workspaces: Workspace[];
  pluginActivityItems: ActivityBarContribution[];
  activeWorkspaceId: string;
  onWorkspaceClick: (workspaceId: string) => void;
  onAddWorkspace: () => void;
  onOpenPluginActivity: (item: ActivityBarContribution) => void;
}

const WORKSPACE_BACKGROUND_COLORS = [
  '#fef3c7',
  '#dbeafe',
  '#dcfce7',
  '#ede9fe',
  '#ffe4e6',
  '#cffafe',
  '#fae8ff',
  '#ffedd5',
  '#e0e7ff',
  '#ccfbf1',
];

export const GlobalRail = ({
  activeMode,
  isCollapsed,
  workspaces,
  pluginActivityItems,
  activeWorkspaceId,
  onWorkspaceClick,
  onAddWorkspace,
  onOpenPluginActivity,
}: GlobalRailProps) => {
  return (
    <div className="w-[64px] border-r border-slate-200 bg-[linear-gradient(180deg,#f7f4ed_0%,#f3efe6_100%)] flex flex-col items-center py-4">
      <div className="flex flex-col gap-3">
        {workspaces.map((workspace) => {
          const isActiveWorkspace = workspace.id === activeWorkspaceId;
          return (
            <Button
              key={workspace.id}
              variant="unstyled"
              size="none"
              onClick={() => onWorkspaceClick(workspace.id)}
              title={`${workspace.name}\n${workspace.path}${isActiveWorkspace && isCollapsed ? '\n点击展开工作区' : ''}`}
              style={{ backgroundColor: getStableWorkspaceBackgroundColor(workspace.path) }}
              className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-2xl border-[2px] text-sm font-bold uppercase transition-all duration-200',
                activeMode === 'sessions' && isActiveWorkspace
                  ? 'border-white ring-1 ring-black/15 text-slate-800 shadow-[0_8px_16px_rgba(0,0,0,0.1)]'
                  : 'border-transparent text-slate-500 hover:border-white/60 hover:text-slate-700 hover:shadow-sm',
              )}
            >
              {getWorkspaceInitial(workspace.name)}
              {isActiveWorkspace && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-white" />
              )}
            </Button>
          );
        })}
        <Button
          variant="unstyled"
          size="none"
          onClick={onAddWorkspace}
          title="添加工作区"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-transparent bg-transparent text-slate-500 transition-colors hover:text-slate-800"
        >
          <Plus size={18} />
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {pluginActivityItems.map((item) => (
          <Button
            variant="unstyled"
            size="none"
            key={`${item.pluginId || 'plugin'}:${item.id}`}
            onClick={() => onOpenPluginActivity(item)}
            title={`${item.title}\n${item.pluginId || 'plugin'}`}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-2xl transition-colors',
              activeMode === `plugin:${item.opens}`
                ? 'bg-slate-900 text-white shadow-[0_8px_20px_rgba(15,23,42,0.2)]'
                : 'bg-white/60 text-slate-500 hover:bg-white hover:text-slate-800',
            )}
          >
            {iconForPluginActivity(item.icon, item.title)}
          </Button>
        ))}
      </div>

      <div className="mt-auto" />
    </div>
  );
};

function getStableWorkspaceBackgroundColor(workspacePath: string) {
  let hash = 0;
  for (let index = 0; index < workspacePath.length; index += 1) {
    hash = (hash * 31 + workspacePath.charCodeAt(index)) >>> 0;
  }
  return WORKSPACE_BACKGROUND_COLORS[hash % WORKSPACE_BACKGROUND_COLORS.length];
}

function getWorkspaceInitial(name: string) {
  return name.trim().slice(0, 1) || '?';
}

function iconForPluginActivity(icon: string | undefined, title: string) {
  const normalized = (icon || title).toLowerCase();
  if (normalized.includes('folder') || normalized.includes('file')) return <FolderTree size={18} />;
  if (normalized.includes('workflow') || normalized.includes('flow')) return <Workflow size={18} />;
  if (normalized.includes('web') || normalized.includes('browser')) return <Globe size={18} />;
  if (normalized.includes('code') || normalized.includes('dev')) return <Code2 size={18} />;
  if (normalized.includes('settings')) return <Settings2 size={18} />;
  return <Puzzle size={18} />;
}
