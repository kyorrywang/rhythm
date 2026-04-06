import { Maximize2, Trash2, CornerDownRight, ArrowRight, Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { AppendDockProps } from '../types';

export const AppendDock = ({ queuedMessages, queueLength, onRemoveItem, onCancelAll, onInterrupt, phase, isMinimized, onToggleMinimize }: AppendDockProps) => {
  const isInterrupting = phase === 'interrupting';

  if (isMinimized) {
    return (
      <div
        className="border-b border-slate-100 bg-[#fbfbfb] px-4 py-2 rounded-t-[28px] transition-all cursor-pointer hover:bg-slate-100 flex items-center justify-between"
        onClick={onToggleMinimize}
      >
        <div className="flex items-center gap-2 text-[12px] text-gray-600">
          <CornerDownRight size={13} className="text-gray-400" />
          <span>{queueLength} 条消息等待</span>
        </div>
        <Maximize2 size={13} className="text-gray-400" />
      </div>
    );
  }

  return (
    <div className="border-b border-slate-100 bg-[#fbfbfb] px-4 py-3 rounded-t-[28px] transition-all">
      <div className="mb-2 flex items-center justify-between text-[12px] font-medium text-slate-800">
        <div className="flex items-center gap-2">
          <span>队列中有 {queueLength} 条消息</span>
          {phase === 'waiting_for_permission' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
              <ShieldAlert size={10} />
              等待权限
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isInterrupting && (
            <span className="text-amber-600 text-[11px]">正在中断...</span>
          )}
          <button onClick={onCancelAll} className="text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {queuedMessages.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {queuedMessages.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-[12px] group rounded-xl px-2 py-1.5 hover:bg-white">
              <CornerDownRight size={12} className={cn(
                "shrink-0",
                item.priority === 'urgent' ? "text-amber-500" : "text-gray-400"
              )} />
              <span className={cn(
                "truncate flex-1",
                item.priority === 'urgent' ? "text-amber-700 font-medium" : "text-gray-600"
              )}>
                {item.message.content}
              </span>
              {item.priority === 'urgent' && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium shrink-0">
                  引导
                </span>
              )}
              <button
                onClick={() => onRemoveItem(item.id)}
                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[12px] text-gray-500">
        <div className="flex items-center gap-2">
          {isInterrupting ? (
            <>
              <Loader2 size={12} className="animate-spin text-amber-500" />
              <span>正在请求中断</span>
            </>
          ) : (
            <>
              <CornerDownRight size={12} className="text-gray-400" />
              <span>运行结束后会自动消费队列</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onInterrupt}
            disabled={isInterrupting}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors",
              isInterrupting
                ? "bg-amber-100 text-amber-600 cursor-wait"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            )}
          >
            <ArrowRight size={11} /> 立即引导
          </button>
        </div>
      </div>
    </div>
  );
};
