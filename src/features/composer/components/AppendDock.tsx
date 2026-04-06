import { Maximize2, Trash2, CornerDownRight, ArrowRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { AppendDockProps } from '../types';

export const AppendDock = ({ queuedMessages, queueLength, onRemoveItem, onCancelAll, onInterrupt, phase, isMinimized, onToggleMinimize }: AppendDockProps) => {
  const isInterrupting = phase === 'interrupting';

  if (isMinimized) {
    return (
      <div
        className="border-b border-gray-100 bg-[#fbfbfb] px-4 py-2 rounded-t-xl transition-all cursor-pointer hover:bg-gray-100 flex items-center justify-between"
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
    <div className="border-b border-gray-100 bg-[#fbfbfb] px-4 py-2.5 rounded-t-xl transition-all">
      <div className="flex items-center justify-between text-[12px] text-gray-800 font-medium mb-2">
        <span>队列中有 {queueLength} 条消息</span>
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
            <div key={item.id} className="flex items-center gap-2 text-[12px] group">
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
          <CornerDownRight size={12} className="text-gray-400" />
          <span>继续</span>
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
          <button className="text-gray-400 hover:text-gray-600">
            <MoreHorizontal size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
