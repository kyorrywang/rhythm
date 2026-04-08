import { useCallback, type KeyboardEvent, type PointerEvent } from 'react';
import { Box, PanelLeftClose, PanelLeftOpen, ScrollText, X } from 'lucide-react';
import { createPluginContext } from '@/plugin/host/createPluginContext';
import { PluginErrorBoundary } from '@/plugin/host/PluginErrorBoundary';
import { usePluginHostStore } from '@/plugin/host/usePluginHostStore';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { themeRecipes } from '@/shared/theme/recipes';
import { EmptyState, IconButton } from '@/shared/ui';
import { WorkbenchResizeHandle } from './WorkbenchResizeHandle';

const DEFAULT_WORKBENCH_SPLIT_WIDTH = 400;
const MIN_WORKBENCH_SPLIT_WIDTH = 280;
const MAX_WORKBENCH_SPLIT_WIDTH = 1200;
const MIN_MAIN_SESSION_WIDTH = 220;
const WORKBENCH_VIEWPORT_PADDING = 80;

export const WorkbenchHost = ({ mode }: { mode: 'split' | 'replace' }) => {
  const workbench = useSessionStore((s) => s.workbench);
  const workbenchSplitWidth = useSessionStore((s) => s.workbenchSplitWidth);
  const closeWorkbench = useSessionStore((s) => s.closeWorkbench);
  const setWorkbenchLayoutMode = useSessionStore((s) => s.setWorkbenchLayoutMode);
  const setWorkbenchSplitWidth = useSessionStore((s) => s.setWorkbenchSplitWidth);
  const workbenchViews = usePluginHostStore((s) => s.workbenchViews);

  if (!workbench) return null;
  const activeItem = workbench.item;
  const view = workbenchViews[activeItem.viewType];
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

  return (
    <>
      <section
        className={`flex h-full min-w-0 flex-col ${themeRecipes.workbenchShell()} ${
          isReplace ? 'flex-1' : 'shrink-0 border-r-[var(--theme-border-width)] border-[var(--theme-border)]'
        }`}
        style={isReplace ? undefined : { width: splitWidth }}
      >
        <div className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] px-[var(--theme-panel-padding-x)] py-[var(--theme-panel-padding-y)]">
          <div className="flex items-center justify-between">
            <div>
              <div className={`flex items-center gap-2 ${themeRecipes.eyebrow()}`}>
                <Box size={14} />
                <span>Workbench</span>
              </div>
              <h3 className={`mt-[var(--theme-panel-header-gap)] ${themeRecipes.title()}`}>{activeItem.title}</h3>
            </div>
            <div className={themeRecipes.toolbar()}>
              <IconButton
                onClick={() => setWorkbenchLayoutMode(isReplace ? 'split' : 'replace')}
                title={isReplace ? '切换为 split' : '切换为 replace'}
              >
                {isReplace ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              </IconButton>
              <IconButton
                onClick={closeWorkbench}
                title="关闭 Workbench"
              >
                <X size={16} />
              </IconButton>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-[var(--theme-shell-padding)] py-[var(--theme-shell-padding)]">
          <div className={`h-full overflow-hidden ${themeRecipes.workbenchSurface()}`}>
            <div className="flex items-center justify-between border-b-[var(--theme-divider-width)] border-[var(--theme-border)] px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]">
              <div className={`flex items-center gap-2 ${themeRecipes.eyebrow()}`}>
                <ScrollText size={14} />
                <span>{view?.title || activeItem.viewType}</span>
              </div>
            </div>
            <div className="h-[calc(100%-calc(var(--theme-card-padding-y)*2+1.5rem))] overflow-hidden">
              {view ? (
                <PluginErrorBoundary pluginId={view.pluginId || activeItem.pluginId} surface={activeItem.viewType}>
                  <view.component
                    ctx={createPluginContext(view.pluginId || activeItem.pluginId)}
                    title={activeItem.title}
                    description={activeItem.description}
                    payload={activeItem.payload}
                  />
                </PluginErrorBoundary>
              ) : (
                <MissingWorkbenchView item={activeItem} />
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
