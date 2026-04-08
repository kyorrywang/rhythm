import type { MessageMode } from '@/shared/types/schema';

interface WorkbenchItem {
  id: string;
  isOpen: boolean;
  pluginId: string;
  viewType: string;
  renderer: string;
  title: string;
  description?: string;
  payload?: unknown;
  lifecycle?: 'snapshot' | 'live';
}

interface OverlayItem {
  id: string;
  pluginId: string;
  viewType: string;
  title: string;
  description?: string;
  payload?: unknown;
  kind: 'drawer' | 'modal';
}

type WorkbenchLayoutMode = 'split' | 'replace';
type OpenWorkbenchInput = Omit<WorkbenchItem, 'id'> & {
  id?: string;
  layoutMode?: WorkbenchLayoutMode;
};
type OpenOverlayInput = Omit<OverlayItem, 'id' | 'kind'> & {
  id?: string;
  kind?: OverlayItem['kind'];
};

interface UiSliceState {
  isContextPanelOpen: boolean;
  leftSidebarCollapsed: boolean;
  activeLeftPanelViewId: string;
  workbenchSplitWidth: number;
  workbench: {
    item: WorkbenchItem;
    layoutMode: WorkbenchLayoutMode;
  } | null;
  overlay: OverlayItem | null;
  composerControls: {
    mode: MessageMode;
    providerId: string;
    modelId: string;
    modelName: string;
    reasoning: 'low' | 'medium' | 'high';
    fullAuto: boolean;
  };
}

interface UiSliceActions {
  setContextPanelOpen: (open: boolean) => void;
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  toggleLeftSidebarCollapsed: () => void;
  setActiveLeftPanelView: (viewId: string) => void;
  setWorkbenchSplitWidth: (width: number) => void;
  openWorkbench: (workbench: OpenWorkbenchInput) => void;
  closeWorkbench: () => void;
  setWorkbenchLayoutMode: (mode: WorkbenchLayoutMode) => void;
  openOverlay: (overlay: OpenOverlayInput) => void;
  closeOverlay: () => void;
  setComposerControls: (updates: Partial<UiSliceState['composerControls']>) => void;
}

export type UiSlice = UiSliceState & UiSliceActions;

const DEFAULT_WORKBENCH_SPLIT_WIDTH = 400;

const buildWorkbenchId = (workbench: OpenWorkbenchInput) =>
  workbench.id || `${workbench.pluginId}:${workbench.viewType}:${workbench.title}`;
const buildOverlayId = (overlay: OpenOverlayInput) =>
  overlay.id || `${overlay.pluginId}:${overlay.viewType}:${overlay.title}`;

export const createUiSlice = (
  set: (partial: Partial<UiSliceState> | ((state: UiSliceState) => Partial<UiSliceState>)) => void,
): UiSliceState & UiSliceActions => ({
  isContextPanelOpen: false,
  leftSidebarCollapsed: false,
  activeLeftPanelViewId: 'core.sessions.panel',
  workbenchSplitWidth: DEFAULT_WORKBENCH_SPLIT_WIDTH,
  workbench: null,
  overlay: null,
  composerControls: {
    mode: 'Chat',
    providerId: 'openai',
    modelId: 'gpt-5.4',
    modelName: 'gpt-5.4',
    reasoning: 'medium',
    fullAuto: false,
  },

  setContextPanelOpen: (open) => set({ isContextPanelOpen: open }),
  setLeftSidebarCollapsed: (collapsed) => set({ leftSidebarCollapsed: collapsed }),
  toggleLeftSidebarCollapsed: () =>
    set((state) => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),
  setActiveLeftPanelView: (viewId) =>
    set({
      activeLeftPanelViewId: viewId,
    }),
  setWorkbenchSplitWidth: (width) =>
    set({
      workbenchSplitWidth: width,
    }),
  openWorkbench: (workbench) =>
    set((state) => {
      const id = buildWorkbenchId(workbench);
      const nextItem: WorkbenchItem = { ...workbench, id, isOpen: true };
      return {
        workbench: {
          item: nextItem,
          layoutMode: workbench.layoutMode || state.workbench?.layoutMode || 'split',
        },
      };
    }),
  closeWorkbench: () => set({ workbench: null }),
  setWorkbenchLayoutMode: (mode) =>
    set((state) => ({
      workbench: state.workbench ? { ...state.workbench, layoutMode: mode } : state.workbench,
    })),
  openOverlay: (overlay) =>
    set({
      overlay: {
        ...overlay,
        id: buildOverlayId(overlay),
        kind: overlay.kind || 'drawer',
      },
    }),
  closeOverlay: () => set({ overlay: null }),
  setComposerControls: (updates) =>
    set((state) => ({
      composerControls: {
        ...state.composerControls,
        ...updates,
      },
    })),
});
