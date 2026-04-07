import { open } from '@tauri-apps/plugin-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '@/shared/hooks/useToast';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { GlobalRail } from './GlobalRail';
import { LeftPanel } from './LeftPanel';

const DEFAULT_LEFT_PANEL_WIDTH = 320;
const MIN_LEFT_PANEL_WIDTH = 240;
const MAX_LEFT_PANEL_WIDTH = 520;
const LEFT_PANEL_WIDTH_STORAGE_KEY = 'rhythm:left-panel-width';
const WORKSPACE_PATH = 'C:\\Users\\Administrator\\Documents\\dev\\rhythm';

export const Sidebar = () => {
  const {
    leftPanelMode,
    leftSidebarCollapsed,
    setLeftPanelMode,
    toggleLeftSidebarCollapsed,
    closeWorkbench,
  } = useSessionStore();
  const { info: showInfo } = useToast();
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(LEFT_PANEL_WIDTH_STORAGE_KEY));
    if (Number.isFinite(savedWidth)) {
      setLeftPanelWidth(clampPanelWidth(savedWidth));
    }
  }, []);

  const handleWorkspaceClick = () => {
    if (leftPanelMode !== 'sessions') {
      setLeftPanelMode('sessions');
      closeWorkbench();
      return;
    }
    toggleLeftSidebarCollapsed();
  };

  const handleAddWorkspace = async () => {
    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: '选择工作区文件夹',
    });

    if (typeof selectedPath === 'string') {
      showInfo(`已选择工作区：${selectedPath}`);
    }
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
      <GlobalRail
        activeMode={leftPanelMode}
        isCollapsed={leftSidebarCollapsed}
        workspacePath={WORKSPACE_PATH}
        onWorkspaceClick={handleWorkspaceClick}
        onAddWorkspace={() => void handleAddWorkspace()}
        onOpenPlugins={() => setLeftPanelMode('plugins')}
        onOpenSettings={() => setLeftPanelMode('settings')}
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
              <LeftPanel width={leftPanelWidth} />
              <div
                role="separator"
                aria-label="调整左侧会话列表宽度"
                aria-orientation="vertical"
                aria-valuemin={MIN_LEFT_PANEL_WIDTH}
                aria-valuemax={MAX_LEFT_PANEL_WIDTH}
                aria-valuenow={leftPanelWidth}
                tabIndex={0}
                onPointerDown={handleResizePointerDown}
                onKeyDown={handleResizeKeyDown}
                className="group relative z-20 h-full w-px shrink-0 cursor-col-resize bg-slate-200 outline-none transition-colors hover:bg-amber-400 focus:bg-amber-400"
              >
                <div className="absolute left-1/2 top-0 h-full w-2 -translate-x-1/2 bg-transparent" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100" />
              </div>
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
