import { useMemo, useRef, useState } from 'react';
import { Archive, Copy, Loader2, MoreHorizontal, Pencil, Pin, RotateCcw, Trash2 } from 'lucide-react';
import type { Session } from '@/shared/types/schema';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
import { Badge, IconButton, MenuContent, MenuItem, MenuPortal, MenuRoot, MenuTrigger } from '@/ui/components';
import { isSessionRunning } from '@/core/sessions/sessionState';

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}

const formatTime = (timestamp: number): string => {
  const now = Date.now();
  const days = Math.floor((now - timestamp) / 86400000);
  const nowDate = new Date(now);
  const targetDate = new Date(timestamp);
  const isSameDay = nowDate.getFullYear() === targetDate.getFullYear()
    && nowDate.getMonth() === targetDate.getMonth()
    && nowDate.getDate() === targetDate.getDate();

  if (isSameDay) {
    return targetDate.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  if (days < 7) return `${Math.max(1, days)}天前`;
  return '一周前';
};

export const SessionItem = ({ session, isActive, onClick }: SessionItemProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const running = isSessionRunning(session);
  const sessions = useSessionStore((s) => s.sessions);
  const togglePinnedSession = useSessionStore((s) => s.togglePinnedSession);
  const archiveSession = useSessionStore((s) => s.archiveSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const restoreSession = useSessionStore((s) => s.restoreSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const hasUnreadCompleted = !isActive && !!session.hasUnreadCompleted;
  const statusNode = useMemo(() => {
    if (running) {
      return <Loader2 size={12} className="animate-spin text-[var(--theme-info-text)]" />;
    }
    if (hasUnreadCompleted) {
      return <div className="h-2 w-2 rounded-full bg-[var(--theme-info-text)]" />;
    }
    if (session.pinned) {
      return <Pin size={12} className="text-[var(--theme-warning-text)]" fill="currentColor" />;
    }
    return <div className="h-[6px] w-[6px] rounded-full bg-[var(--theme-border-strong)]" />;
  }, [running, hasUnreadCompleted, session.pinned]);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={cn('group', themeRecipes.listRow(isActive))}
    >
      <div className="flex min-w-0 flex-1 items-start gap-[var(--theme-row-gap)]">
        <div className="relative flex h-5 w-3 shrink-0 items-center justify-center">
          <span className={cn('flex items-center justify-center transition-opacity duration-200', !session.pinned && 'group-hover:opacity-0')}>
            {statusNode}
          </span>
          <button
            type="button"
            title={session.pinned ? '取消置顶' : '置顶会话'}
            aria-label={session.pinned ? '取消置顶' : '置顶会话'}
            onClick={(event) => {
              event.stopPropagation();
              togglePinnedSession(session.id);
            }}
            className={cn(
              'absolute inset-0 flex cursor-pointer items-center justify-center text-[var(--theme-warning-text)] transition-opacity duration-200',
              session.pinned ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <Pin size={12} fill="currentColor" />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn('truncate text-[length:var(--theme-body-size)] font-medium leading-5 transition-colors', themeRecipes.listRowTitle(isActive))}>
            {session.title}
          </div>
          {session.archived && (
            <div className="mt-1 flex items-center gap-2">
              <Badge tone="muted">已归档</Badge>
            </div>
          )}
        </div>
      </div>

      <div className="relative ml-2 flex h-5 w-14 shrink-0 items-center justify-end">
        <span className={cn('absolute right-1 min-w-[3.25rem] whitespace-nowrap text-right text-[length:var(--theme-meta-size)] transition-opacity duration-200', themeRecipes.listRowMeta(isActive), menuOpen ? 'opacity-0' : 'opacity-100 group-hover:opacity-0')}>
          {formatTime(session.updatedAt)}
        </span>
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
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className={`absolute right-0 focus:ring-0 transition-all duration-200 ${
                menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
              }`}
            >
              <MoreHorizontal size={14} />
            </IconButton>
          </MenuTrigger>
          <MenuPortal>
            <MenuContent
              align="end"
              sideOffset={8}
              collisionPadding={12}
              className="w-40"
            >
              <MenuAction
                icon={<Pencil size={13} />}
                label="重命名"
                onClick={() => {
                  const nextTitle = window.prompt('重命名会话', session.title);
                  if (nextTitle?.trim()) renameSession(session.id, nextTitle.trim());
                }}
              />
              <MenuAction
                icon={<Copy size={13} />}
                label="复制会话 ID"
                onClick={async () => {
                  await navigator.clipboard.writeText(session.id);
                }}
              />
              {session.archived ? (
                <MenuAction
                  icon={<RotateCcw size={13} />}
                  label="恢复会话"
                  onClick={() => restoreSession(session.id)}
                />
              ) : (
                <MenuAction
                  icon={<Archive size={13} />}
                  label="归档会话"
                  onClick={() => archiveSession(session.id)}
                />
              )}
              <MenuAction
                icon={<Trash2 size={13} />}
                label="删除会话"
                danger
                onClick={() => {
                  const confirmed = window.confirm(`确认删除会话“${session.title}”？此操作不可恢复。`);
                  if (!confirmed) return;

                  const nextSession = Array.from(sessions.values())
                    .filter((item) =>
                      item.id !== session.id
                      && item.workspacePath === session.workspacePath
                      && !item.parentId
                      && !item.archived,
                    )
                    .sort((a, b) => {
                      const updatedDiff = b.updatedAt - a.updatedAt;
                      if (updatedDiff !== 0) return updatedDiff;
                      return a.id.localeCompare(b.id);
                    })[0];

                  removeSession(session.id);
                  setActiveSession(nextSession?.id ?? null);
                }}
              />
            </MenuContent>
          </MenuPortal>
        </MenuRoot>
      </div>
    </div>
  );
};

const MenuAction = ({
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
  <MenuItem onSelect={onClick} icon={icon} className={danger ? 'text-[var(--theme-danger-text)]' : undefined}>
    {label}
  </MenuItem>
);
