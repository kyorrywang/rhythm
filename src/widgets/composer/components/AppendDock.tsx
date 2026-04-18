import { Maximize2, Trash2, CornerDownRight, ArrowRight, Loader2, ShieldAlert, RotateCcw, MessageSquareQuote } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import { Button } from '@/shared/ui/Button';
import type { AppendDockProps, PendingItem } from '@/features/chat/model/types';

export const AppendDock = ({ items, onRemoveItem, onCancelAll, onInterrupt, queueState, isMinimized, onToggleMinimize }: AppendDockProps) => {
  const isInterrupting = queueState === 'interrupting';
  const queueItems = items.filter((item) => item.kind === 'queued_message');
  const queueLength = queueItems.length;
  const summaryLabel = buildSummaryLabel(items);

  if (isMinimized) {
    return (
      <div
        className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-surface)_0%,var(--theme-panel-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.6)] transition-all cursor-pointer hover:bg-[var(--theme-surface-muted)] flex items-center justify-between"
        onClick={onToggleMinimize}
      >
        <div className={`flex items-center gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>
          <CornerDownRight size={13} className="text-[var(--theme-text-muted)]" />
          <span>{summaryLabel}</span>
        </div>
        <Maximize2 size={13} className="text-[var(--theme-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-surface)_0%,var(--theme-panel-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.75)] transition-all">
      <div className={`mb-[var(--theme-toolbar-gap)] flex items-center justify-between ${themeRecipes.sectionTitle()}`}>
        <div className="flex items-center gap-[var(--theme-toolbar-gap)]">
          <span>当前有 {items.length} 项待处理</span>
          {items.some((item) => item.kind === 'permission_request') && (
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
          {queueLength > 0 && (
            <Button variant="ghost" size="icon" onClick={onCancelAll} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-danger-text)]">
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mb-[var(--theme-toolbar-gap)] space-y-[calc(var(--theme-toolbar-gap)*0.5)]">
          {items.map((item) => (
            <div key={item.id} className="group flex items-center gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-radius-control)] px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.7)] text-[length:var(--theme-meta-size)] hover:bg-[var(--theme-surface)]">
              <PendingItemIcon item={item} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[var(--theme-text-secondary)]">{item.title}</div>
                <div className="mt-0.5 truncate text-[var(--theme-text-muted)]">{item.description}</div>
              </div>
              {item.kind === 'queued_message' && item.queuedMessage.priority === 'urgent' && (
                <span className={`${themeRecipes.badge('warning')} shrink-0`}>
                  引导
                </span>
              )}
              {item.kind === 'retry_backoff' && typeof item.runtime.retryInSeconds === 'number' && item.runtime.retryInSeconds > 0 && (
                <span className={`${themeRecipes.badge('warning')} shrink-0`}>
                  {item.runtime.retryInSeconds}s
                </span>
              )}
              {item.kind === 'queued_message' && (
                <Button
                  variant="unstyled"
                  size="none"
                  onClick={() => onRemoveItem(item.queuedMessage.id)}
                  className="opacity-0 transition-all group-hover:opacity-100 shrink-0 text-[var(--theme-text-muted)] hover:text-[var(--theme-danger-text)]"
                >
                  <Trash2 size={11} />
                </Button>
              )}
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
              <span>{footerHint(items, queueLength)}</span>
            </>
          )}
        </div>
        <div className={themeRecipes.toolbar()}>
          <Button
            variant="secondary"
            size="sm"
            onClick={onInterrupt}
            disabled={isInterrupting}
            className={cn(isInterrupting ? 'cursor-wait text-[var(--theme-warning-text)]' : 'text-[var(--theme-warning-text)]')}
          >
            <ArrowRight size={11} /> 停止当前运行
          </Button>
        </div>
      </div>
    </div>
  );
};

function buildSummaryLabel(items: PendingItem[]) {
  if (items.length === 0) return '没有待处理项';
  const retryCount = items.filter((item) => item.kind === 'retry_backoff').length;
  const permissionCount = items.filter((item) => item.kind === 'permission_request').length;
  const askCount = items.filter((item) => item.kind === 'ask_request').length;
  const queueCount = items.filter((item) => item.kind === 'queued_message').length;
  const parts = [
    retryCount > 0 ? `${retryCount} 个重试` : '',
    permissionCount > 0 ? `${permissionCount} 个权限请求` : '',
    askCount > 0 ? `${askCount} 个待回答问题` : '',
    queueCount > 0 ? `${queueCount} 条排队消息` : '',
  ].filter(Boolean);
  return parts.join(' / ');
}

function footerHint(items: PendingItem[], queueCount: number) {
  if (items.some((item) => item.kind === 'retry_backoff')) {
    return '系统会按统一运行态自动重试';
  }
  if (items.some((item) => item.kind === 'permission_request')) {
    return '请先处理权限请求，当前会话才能继续';
  }
  if (items.some((item) => item.kind === 'ask_request')) {
    return '当前会话在等待你的回答';
  }
  if (queueCount > 0) {
    return '运行结束后会自动消费排队消息';
  }
  return '当前没有待处理项';
}

function PendingItemIcon({ item }: { item: PendingItem }) {
  if (item.kind === 'retry_backoff') {
    return <RotateCcw size={12} className="shrink-0 text-[var(--theme-warning-text)]" />;
  }
  if (item.kind === 'permission_request') {
    return <ShieldAlert size={12} className="shrink-0 text-[var(--theme-warning-text)]" />;
  }
  if (item.kind === 'ask_request') {
    return <MessageSquareQuote size={12} className="shrink-0 text-[var(--theme-warning-text)]" />;
  }
  return (
    <CornerDownRight
      size={12}
      className={cn(
        'shrink-0',
        item.queuedMessage.priority === 'urgent' ? 'text-[var(--theme-warning-text)]' : 'text-[var(--theme-text-muted)]',
      )}
    />
  );
}


