import { useMemo, useState } from 'react';
import { Archive, Loader2, MoreHorizontal, Pin, Pencil, Copy, RotateCcw } from 'lucide-react';
import type { Session } from '@/shared/types/schema';
import { useSessionStore } from '@/shared/state/useSessionStore';

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
      return <Pin size={12} className="text-amber-600" fill="currentColor" />;
    }
    return <div className="h-[6px] w-[6px] rounded-full bg-slate-300" />;
  }, [running, hasUnreadCompleted, session.pinned]);

  return (
    <div
      className={`group relative flex items-center justify-between rounded-2xl px-3 py-2.5 transition-colors ${
        isActive ? 'bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)] ring-1 ring-slate-200' : 'hover:bg-white/80'
      }`}
    >
      <button onClick={onClick} className="mr-2 flex min-w-0 flex-1 items-center text-left">
        <div className="mr-2 flex w-5 shrink-0 items-center justify-center">{statusNode}</div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-slate-800">{session.title}</div>
          <div className="mt-0.5 truncate text-[11px] text-slate-400">{session.archived ? '已归档' : session.id}</div>
        </div>
      </button>

      <div className="relative flex w-14 shrink-0 items-center justify-end text-right">
        <span className="line-clamp-1 text-[10px] text-slate-400 group-hover:hidden">{formatTime(session.updatedAt)}</span>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="hidden rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 group-hover:block"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-7 z-20 w-40 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_30px_rgba(15,23,42,0.12)]">
            <MenuAction
              icon={<Pin size={13} />}
              label={session.pinned ? '取消置顶' : '置顶会话'}
              onClick={() => {
                togglePinnedSession(session.id);
                setMenuOpen(false);
              }}
            />
            <MenuAction
              icon={<Pencil size={13} />}
              label="重命名"
              onClick={() => {
                const nextTitle = window.prompt('重命名会话', session.title);
                if (nextTitle?.trim()) renameSession(session.id, nextTitle.trim());
                setMenuOpen(false);
              }}
            />
            <MenuAction
              icon={<Copy size={13} />}
              label="复制会话 ID"
              onClick={async () => {
                await navigator.clipboard.writeText(session.id);
                setMenuOpen(false);
              }}
            />
            {session.archived ? (
              <MenuAction
                icon={<RotateCcw size={13} />}
                label="恢复会话"
                onClick={() => {
                  restoreSession(session.id);
                  setMenuOpen(false);
                }}
              />
            ) : (
              <MenuAction
                icon={<Archive size={13} />}
                label="归档会话"
                onClick={() => {
                  archiveSession(session.id);
                  setMenuOpen(false);
                }}
              />
            )}
          </div>
        )}
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
  <button
    onClick={onClick}
    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
  >
    {icon}
    <span>{label}</span>
  </button>
);
