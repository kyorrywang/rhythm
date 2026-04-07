import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Archive, Loader2, MoreHorizontal, Pin, Pencil, Copy, RotateCcw } from 'lucide-react';
import type { Session } from '@/shared/types/schema';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { Button } from '@/shared/ui/Button';

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}

const formatTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
};

const isSessionRunning = (session: Session): boolean =>
  session.phase !== 'idle' && session.phase !== undefined && session.phase !== null;

export const SessionItem = ({ session, isActive, onClick }: SessionItemProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const running = isSessionRunning(session);
  const togglePinnedSession = useSessionStore((s) => s.togglePinnedSession);
  const archiveSession = useSessionStore((s) => s.archiveSession);
  const restoreSession = useSessionStore((s) => s.restoreSession);
  const renameSession = useSessionStore((s) => s.renameSession);

  const hasUnreadCompleted = !isActive && !!session.hasUnreadCompleted;
  const statusNode = useMemo(() => {
    if (running) {
      return <Loader2 size={12} className="animate-spin text-sky-500" />;
    }
    if (hasUnreadCompleted) {
      return <div className="h-2 w-2 rounded-full bg-sky-500" />;
    }
    if (session.pinned) {
      return <Pin size={12} className="text-amber-500" fill="currentColor" />;
    }
    return <div className="h-[6px] w-[6px] rounded-full bg-slate-300" />;
  }, [running, hasUnreadCompleted, session.pinned]);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`group relative flex w-full cursor-pointer items-start justify-between rounded-xl px-2.5 py-2.5 outline-none transition-all ${
        isActive 
          ? 'bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] ring-1 ring-slate-200/60' 
          : 'hover:bg-white/60'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <div className="flex h-5 w-3 shrink-0 items-center justify-center">{statusNode}</div>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[13px] font-medium leading-5 transition-colors ${isActive ? 'text-slate-900' : 'text-slate-700 group-hover:text-slate-900'}`}>
            {session.title}
          </div>
          {session.archived && (
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="rounded bg-slate-100 px-1 py-[1px] text-[10px] font-medium text-slate-500">
                已归档
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="relative ml-2 flex h-5 w-14 shrink-0 items-center justify-end">
        <span className={`absolute right-1 text-[10px] text-slate-400 transition-opacity duration-200 ${menuOpen ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'}`}>
          {formatTime(session.updatedAt)}
        </span>
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="unstyled"
              size="none"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className={`absolute right-0 rounded-md p-1 text-slate-400 transition-all duration-200 ${
                menuOpen ? 'bg-slate-100 text-slate-700 opacity-100' : 'pointer-events-none opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:pointer-events-auto group-hover:opacity-100'
              }`}
            >
              <MoreHorizontal size={14} />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              collisionPadding={12}
              className="z-50 w-40 origin-[--radix-dropdown-menu-content-transform-origin] rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl outline-none data-[state=open]:animate-[composer-popover-in_180ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
            >
              <MenuAction
                icon={<Pin size={13} />}
                label={session.pinned ? '取消置顶' : '置顶会话'}
                onClick={() => togglePinnedSession(session.id)}
              />
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
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
};

const MenuAction = ({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <DropdownMenu.Item
    onSelect={onClick}
    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-slate-600 outline-none transition-colors hover:bg-slate-50 hover:text-slate-900 focus:bg-slate-50 focus:text-slate-900"
  >
    {icon}
    <span>{label}</span>
  </DropdownMenu.Item>
);
