import { Loader2 } from 'lucide-react';
import type { Session } from '@/types/schema';

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

const isSessionRunning = (session: Session): boolean => {
  return session.phase !== 'idle' && session.phase !== undefined && session.phase !== null;
};

export const SessionItem = ({ session, isActive, onClick }: SessionItemProps) => {
  const running = isSessionRunning(session);

  return (
    <div
      onClick={onClick}
      className={`group relative flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-colors ${
        isActive ? 'bg-[#e8e8e8]' : 'hover:bg-[#efefef]'
      }`}
    >
      <div className="flex items-center overflow-hidden mr-2">
        <div className="w-4 flex items-center justify-center shrink-0 mr-1">
          {running ? (
            <Loader2 size={12} className="animate-spin text-gray-400" />
          ) : (
            <div className="w-[6px] h-[1.5px] bg-gray-300 rounded-full" />
          )}
        </div>
        <span className="text-[13px] text-gray-700 truncate">{session.title}</span>
      </div>

      <div className="shrink-0 flex items-center justify-end w-12 text-right">
        <span className="text-[10px] text-gray-400 group-hover:hidden line-clamp-1">
          {formatTime(session.updatedAt)}
        </span>
      </div>
    </div>
  );
};
