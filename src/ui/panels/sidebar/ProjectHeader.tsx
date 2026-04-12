import { useRef, useState } from 'react';
import { FileEdit, FolderOpen, FolderSearch, MoreHorizontal } from 'lucide-react';
import { themeRecipes } from '@/ui/theme/recipes';
import { Button, IconButton, MenuContent, MenuItem, MenuPortal, MenuRoot, MenuTrigger } from '@/ui/components';

interface ProjectHeaderProps {
  workspaceName: string;
  workspacePath: string;
  onNewSession: () => void;
  onChangeWorkspace: () => void;
  onOpenWorkspace: () => void;
}

export const ProjectHeader = ({
  workspaceName,
  workspacePath,
  onNewSession,
  onChangeWorkspace,
  onOpenWorkspace,
}: ProjectHeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="px-4 pb-4 pt-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className={`text-[11px] uppercase tracking-[0.18em] ${themeRecipes.eyebrow()}`}>Workspace</div>
          <h2 className={`mt-2 text-[22px] leading-tight ${themeRecipes.title()}`}>{workspaceName}</h2>
          <p className={`mt-1 truncate text-[12px] ${themeRecipes.description()}`} title={workspacePath}>{workspacePath}</p>
        </div>
        <MenuRoot
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) {
              triggerRef.current?.blur();
            }
          }}
        >
          <MenuTrigger asChild>
            <IconButton
              ref={triggerRef}
              className="ml-2 focus:ring-0 data-[state=open]:bg-[var(--theme-surface)] data-[state=open]:text-[var(--theme-text-primary)]"
              title="工作区操作"
            >
              <MoreHorizontal size={18} />
            </IconButton>
          </MenuTrigger>
          <MenuPortal>
            <MenuContent
              align="end"
              sideOffset={8}
              collisionPadding={16}
              className="w-56"
            >
              <WorkspaceMenuAction icon={<FolderSearch size={13} />} label="Change Workspace" onClick={onChangeWorkspace} />
              <WorkspaceMenuAction icon={<FolderOpen size={13} />} label="Reveal in File Explorer" onClick={onOpenWorkspace} />
            </MenuContent>
          </MenuPortal>
        </MenuRoot>
      </div>

      <Button
        variant="primary"
        size="md"
        onClick={onNewSession}
        className="flex w-full items-center justify-center gap-[var(--theme-toolbar-gap)]"
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
  <MenuItem onSelect={onClick} icon={icon} danger={danger}>
    {label}
  </MenuItem>
);
