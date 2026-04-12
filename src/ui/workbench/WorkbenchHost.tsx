import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, ScrollText } from 'lucide-react';
import { createPluginContext } from '@/core/plugin/host/createPluginContext';
import { PluginErrorBoundary } from '@/core/plugin/host/PluginErrorBoundary';
import { usePluginHostStore } from '@/core/plugin/host/usePluginHostStore';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import { themeRecipes } from '@/ui/theme/recipes';
import { EmptyState, IconButton } from '@/ui/components';
import { WorkbenchHeaderCenterProvider } from './WorkbenchHeaderCenterContext';
import { WorkbenchResizeHandle } from './WorkbenchResizeHandle';

const DEFAULT_WORKBENCH_SPLIT_WIDTH = 400;
const MIN_WORKBENCH_SPLIT_WIDTH = 280;
const MAX_WORKBENCH_SPLIT_WIDTH = 1200;
const MIN_MAIN_SESSION_WIDTH = 420;
const WORKBENCH_VIEWPORT_PADDING = 80;

export const WorkbenchHost = ({ mode }: { mode: 'split' | 'replace' }) => {
  const workbench = useSessionStore((s) => s.workbench);
  const workbenchSplitWidth = useSessionStore((s) => s.workbenchSplitWidth);
  const setWorkbenchLayoutMode = useSessionStore((s) => s.setWorkbenchLayoutMode);
  const setWorkbenchSplitWidth = useSessionStore((s) => s.setWorkbenchSplitWidth);
  const workbenchViews = usePluginHostStore((s) => s.workbenchViews);
  const activeItem = workbench?.item;
  const view = activeItem ? workbenchViews[activeItem.viewType] : undefined;
  const ctx = useMemo(
    () => createPluginContext(view?.pluginId || activeItem?.pluginId || 'unknown'),
    [activeItem?.pluginId, view?.pluginId],
  );
  const [headerCenterContent, setHeaderCenterContent] = useState<ReactNode | null>(null);

  if (!workbench) return null;
  const currentItem = workbench.item;
  const isReplace = mode === 'replace';
  const maxSplitWidth = getWorkbenchMaxWidth();
  const splitWidth = clampWorkbenchWidth(workbenchSplitWidth || DEFAULT_WORKBENCH_SPLIT_WIDTH);

  const updateWorkbenchWidth = useCallback((nextWidth: number) => {
    setWorkbenchSplitWidth(clampWorkbenchWidth(nextWidth));
  }, [setWorkbenchSplitWidth]);

  const handleResizePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startWidth = splitWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      updateWorkbenchWidth(startWidth + moveEvent.clientX - startX);
    };

    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [splitWidth, updateWorkbenchWidth]);

  const handleResizeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      updateWorkbenchWidth(splitWidth - 16);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      updateWorkbenchWidth(splitWidth + 16);
    }
  }, [splitWidth, updateWorkbenchWidth]);

  useEffect(() => {
    setHeaderCenterContent(null);
  }, [currentItem.id]);

  return (
    <>
      <section
        className={`flex h-full min-w-0 flex-col ${themeRecipes.workbenchShell()} ${
          isReplace ? 'flex-1' : 'shrink-0 border-r-[var(--theme-border-width)] border-[var(--theme-border)]'
        }`}
        style={isReplace ? undefined : { width: splitWidth }}
      >
        <div className="flex-1 overflow-hidden px-[var(--theme-shell-padding)] py-[var(--theme-shell-padding)]">
          <div className="h-full overflow-hidden">
            <div className="flex items-center gap-4 border-b-[var(--theme-divider-width)] border-[var(--theme-border)] px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]">
              <div className={`flex shrink-0 items-center gap-2 ${themeRecipes.eyebrow()}`}>
                <ScrollText size={14} />
                <span>{view?.title || currentItem.viewType}</span>
              </div>
              <div className="flex min-w-0 flex-1 justify-center">
                {headerCenterContent}
              </div>
              <div className="flex items-center gap-[var(--theme-toolbar-gap)]">
                {currentItem.viewType === 'folder.file.preview' && currentItem.description ? (
                  <div className={`shrink-0 text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>
                    {currentItem.description}
                  </div>
                ) : null}
                <IconButton
                  onClick={() => setWorkbenchLayoutMode(isReplace ? 'split' : 'replace')}
                  title={isReplace ? 'Switch to Split View' : 'Switch to Replace View'}
                >
                  {isReplace ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                </IconButton>
              </div>
            </div>
            <div className="h-[calc(100%-calc(var(--theme-card-padding-y)*2+1.5rem))] overflow-hidden">
              {view ? (
                <PluginErrorBoundary pluginId={view.pluginId || currentItem.pluginId} surface={currentItem.viewType}>
                  <WorkbenchHeaderCenterProvider
                    value={{
                      workbenchId: currentItem.id,
                      setHeaderCenterContent,
                    }}
                  >
                    <view.component
                      ctx={ctx}
                      title={currentItem.title}
                      description={currentItem.description}
                      payload={currentItem.payload}
                    />
                  </WorkbenchHeaderCenterProvider>
                </PluginErrorBoundary>
              ) : (
                <MissingWorkbenchView item={currentItem} />
              )}
            </div>
          </div>
        </div>
      </section>
      {!isReplace && (
        <WorkbenchResizeHandle
          width={splitWidth}
          minWidth={MIN_WORKBENCH_SPLIT_WIDTH}
          maxWidth={maxSplitWidth}
          onPointerDown={handleResizePointerDown}
          onKeyDown={handleResizeKeyDown}
        />
      )}
    </>
  );
};

const MissingWorkbenchView = ({ item }: { item: NonNullable<ReturnType<typeof useSessionStore.getState>['workbench']>['item'] }) => (
  <div className="h-full overflow-auto px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]">
    <EmptyState title={item.title} description={`没有插件注册 \`${item.viewType}\` 这个 Workbench view。插件未加载或 view id 不匹配。`} />
  </div>
);

function clampWorkbenchWidth(width: number) {
  return Math.min(getWorkbenchMaxWidth(), Math.max(MIN_WORKBENCH_SPLIT_WIDTH, Math.round(width)));
}

function getWorkbenchMaxWidth() {
  if (typeof window === 'undefined') {
    return MAX_WORKBENCH_SPLIT_WIDTH;
  }
  return Math.min(
    MAX_WORKBENCH_SPLIT_WIDTH,
    Math.max(
      MIN_WORKBENCH_SPLIT_WIDTH,
      Math.round(window.innerWidth - MIN_MAIN_SESSION_WIDTH - WORKBENCH_VIEWPORT_PADDING),
    ),
  );
}
