import { AnimatePresence, motion } from 'framer-motion';
import { useSessionStore } from '@/features/chat/store/useSessionStore';
import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ActivityRail } from './ActivityRail';
import { LeftPanelHost } from './LeftPanelHost';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import { usePluginHostStore } from '@/features/plugins/services/host/usePluginHostStore';
import type { ActivityBarContribution } from '@/features/plugins/services/sdk';

const DEFAULT_LEFT_PANEL_WIDTH = 320;
const MIN_LEFT_PANEL_WIDTH = 240;
const MAX_LEFT_PANEL_WIDTH = 520;
const LEFT_PANEL_WIDTH_STORAGE_KEY = 'rhythm:left-panel-width';

export const Sidebar = () => {
  const {
    activeLeftPanelViewId,
    leftSidebarCollapsed,
    closeWorkbench,
    setActiveLeftPanelView,
  } = useSessionStore();
  const pluginActivityItems = usePluginHostStore((state) => state.activityBarItems);
  const leftPanels = usePluginHostStore((state) => state.leftPanels);
  const workspaceActivityItems = pluginActivityItems.filter((item) => (item.scope || 'workspace') === 'workspace');
  const globalActivityItems = pluginActivityItems.filter((item) => item.scope === 'global');
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(LEFT_PANEL_WIDTH_STORAGE_KEY));
    if (Number.isFinite(savedWidth)) {
      setLeftPanelWidth(clampPanelWidth(savedWidth));
    }
  }, []);

  useEffect(() => {
    if (leftPanels[activeLeftPanelViewId]) return;
    setActiveLeftPanelView('core.sessions.panel');
  }, [activeLeftPanelViewId, leftPanels, setActiveLeftPanelView]);

  const handleOpenPluginActivity = (item: ActivityBarContribution) => {
    if (item.opens === 'core.sessions.panel') {
      closeWorkbench();
    }
    setActiveLeftPanelView(item.opens);
  };

  const updateLeftPanelWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampPanelWidth(nextWidth);
    setLeftPanelWidth(clampedWidth);
    window.localStorage.setItem(LEFT_PANEL_WIDTH_STORAGE_KEY, String(clampedWidth));
  }, []);

  const handleResizePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startWidth = leftPanelWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      updateLeftPanelWidth(startWidth + moveEvent.clientX - startX);
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
  }, [leftPanelWidth, updateLeftPanelWidth]);

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      updateLeftPanelWidth(leftPanelWidth - 16);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      updateLeftPanelWidth(leftPanelWidth + 16);
    }
  };

  return (
    <div className="flex h-screen shrink-0">
      <ActivityRail
        activeViewId={activeLeftPanelViewId}
        workspaceActivityItems={workspaceActivityItems}
        globalActivityItems={globalActivityItems}
        onOpenActivity={handleOpenPluginActivity}
      />
      <AnimatePresence initial={false}>
        {!leftSidebarCollapsed && (
          <motion.div
            key="left-panel"
            initial={{ width: 0 }}
            animate={{ width: leftPanelWidth + 1 }}
            exit={{ width: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="h-full shrink-0 overflow-hidden"
          >
            <div className="flex h-full" style={{ width: leftPanelWidth + 1 }}>
              <LeftPanelHost width={leftPanelWidth} />
              <SidebarResizeHandle
                width={leftPanelWidth}
                minWidth={MIN_LEFT_PANEL_WIDTH}
                maxWidth={MAX_LEFT_PANEL_WIDTH}
                onPointerDown={handleResizePointerDown}
                onKeyDown={handleResizeKeyDown}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function clampPanelWidth(width: number) {
  return Math.min(MAX_LEFT_PANEL_WIDTH, Math.max(MIN_LEFT_PANEL_WIDTH, Math.round(width)));
}

