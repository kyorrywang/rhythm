import { Maximize2, Trash2, CornerDownRight, ArrowRight, Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import { Button } from '@/shared/ui/Button';
import { AppendDockProps } from '../types';

export const AppendDock = ({ queuedMessages, queueLength, onRemoveItem, onCancelAll, onInterrupt, phase, isMinimized, onToggleMinimize }: AppendDockProps) => {
  const isInterrupting = phase === 'interrupting';

  if (isMinimized) {
    return (
      <div
        className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-surface)_0%,var(--theme-panel-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.6)] transition-all cursor-pointer hover:bg-[var(--theme-surface-muted)] flex items-center justify-between"
        onClick={onToggleMinimize}
      >
        <div className={`flex items-center gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>
          <CornerDownRight size={13} className="text-[var(--theme-text-muted)]" />
          <span>{queueLength} 条消息等待</span>
        </div>
        <Maximize2 size={13} className="text-[var(--theme-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-surface)_0%,var(--theme-panel-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.75)] transition-all">
      <div className={`mb-[var(--theme-toolbar-gap)] flex items-center justify-between ${themeRecipes.sectionTitle()}`}>
        <div className="flex items-center gap-[var(--theme-toolbar-gap)]">
          <span>队列中有 {queueLength} 条消息</span>
          {phase === 'waiting_for_permission' && (
            <span className={`${themeRecipes.badge('warning')} gap-1`}>
              <ShieldAlert size={10} />
              等待权限
            </span>
          )}
        </div>
        <div className={themeRecipes.toolbar()}>
          {isInterrupting && (
            <span className="text-[length:var(--theme-meta-size)] text-[var(--theme-warning-text)]">正在中断...</span>
          )}
          <Button variant="ghost" size="icon" onClick={onCancelAll} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-danger-text)]">
            <Trash2 size={12} />
          </Button>
        </div>
      </div>

      {queuedMessages.length > 0 && (
        <div className="mb-[var(--theme-toolbar-gap)] space-y-[calc(var(--theme-toolbar-gap)*0.5)]">
          {queuedMessages.map((item) => (
            <div key={item.id} className="group flex items-center gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-radius-control)] px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.7)] text-[length:var(--theme-meta-size)] hover:bg-[var(--theme-surface)]">
              <CornerDownRight size={12} className={cn(
                "shrink-0",
                item.priority === 'urgent' ? "text-[var(--theme-warning-text)]" : "text-[var(--theme-text-muted)]"
              )} />
              <span className={cn(
                "truncate flex-1",
                item.priority === 'urgent' ? "font-medium text-[var(--theme-warning-text)]" : "text-[var(--theme-text-secondary)]"
              )}>
                {item.message.content}
              </span>
              {item.priority === 'urgent' && (
                <span className={`${themeRecipes.badge('warning')} shrink-0`}>
                  引导
                </span>
              )}
              <Button
                variant="unstyled"
                size="none"
                onClick={() => onRemoveItem(item.id)}
                className="opacity-0 transition-all group-hover:opacity-100 shrink-0 text-[var(--theme-text-muted)] hover:text-[var(--theme-danger-text)]"
              >
                <Trash2 size={11} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className={`flex items-center justify-between text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>
        <div className="flex items-center gap-[var(--theme-toolbar-gap)]">
          {isInterrupting ? (
            <>
              <Loader2 size={12} className="animate-spin text-[var(--theme-warning-text)]" />
              <span>正在请求中断</span>
            </>
          ) : (
            <>
              <CornerDownRight size={12} className="text-[var(--theme-text-muted)]" />
              <span>运行结束后会自动消费队列</span>
            </>
          )}
        </div>
        <div className={themeRecipes.toolbar()}>
          <Button
            variant="secondary"
            size="sm"
            onClick={onInterrupt}
            disabled={isInterrupting}
            className={cn(isInterrupting ? "cursor-wait text-[var(--theme-warning-text)]" : "text-[var(--theme-warning-text)]")}
          >
            <ArrowRight size={11} /> 立即引导
          </Button>
        </div>
      </div>
    </div>
  );
};
