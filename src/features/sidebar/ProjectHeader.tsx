import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Copy, FileEdit, FolderOpen, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';

interface ProjectHeaderProps {
  workspaceName: string;
  workspacePath: string;
  onNewSession: () => void;
  onCopyWorkspacePath: () => void;
  onOpenWorkspace: () => void;
  onRemoveWorkspace: () => void;
}

export const ProjectHeader = ({
  workspaceName,
  workspacePath,
  onNewSession,
  onCopyWorkspacePath,
  onOpenWorkspace,
  onRemoveWorkspace,
}: ProjectHeaderProps) => {
  return (
    <div className="px-4 pb-4 pt-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Workspace</div>
          <h2 className="mt-2 text-[22px] font-semibold leading-tight text-slate-900">{workspaceName}</h2>
          <p className="mt-1 truncate text-[12px] text-slate-500" title={workspacePath}>{workspacePath}</p>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="unstyled"
              size="none"
              className="ml-2 rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 focus:outline-none data-[state=open]:bg-white data-[state=open]:text-slate-700"
              title="工作区操作"
            >
              <MoreHorizontal size={18} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              collisionPadding={16}
              className="z-50 w-48 origin-[--radix-dropdown-menu-content-transform-origin] rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl outline-none data-[state=closed]:animate-[composer-popover-out_120ms_ease-in_forwards] data-[state=open]:animate-[composer-popover-in_180ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
            >
              <WorkspaceMenuAction icon={<Copy size={13} />} label="复制工作区路径" onClick={onCopyWorkspacePath} />
              <WorkspaceMenuAction icon={<FolderOpen size={13} />} label="在系统文件管理器打开" onClick={onOpenWorkspace} />
              <WorkspaceMenuAction icon={<Trash2 size={13} />} label="从工作区列表移除" onClick={onRemoveWorkspace} danger />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <Button
        variant="primary"
        size="md"
        onClick={onNewSession}
        className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13px] shadow-[0_14px_30px_rgba(15,23,42,0.16)]"
      >
        <FileEdit size={14} opacity={0.7} />
        新建会话
      </Button>
    </div>
  );
};

const WorkspaceMenuAction = ({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) => (
  <DropdownMenu.Item
    onSelect={onClick}
    className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] outline-none transition-colors ${
      danger
        ? 'text-red-500 hover:bg-red-50 hover:text-red-600 focus:bg-red-50 focus:text-red-600'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus:bg-slate-50 focus:text-slate-900'
    }`}
  >
    {icon}
    <span>{label}</span>
  </DropdownMenu.Item>
);
