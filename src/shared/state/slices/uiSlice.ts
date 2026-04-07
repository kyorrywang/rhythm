import type { MessageMode } from '@/shared/types/schema';

interface WorkbenchItem {
  id: string;
  isOpen: boolean;
  mode: 'plugin' | 'settings' | 'file' | 'diff' | 'web' | 'task';
  title: string;
  description?: string;
  content?: string;
  meta?: {
    path?: string;
    url?: string;
    summary?: string;
  };
}

interface UiSliceState {
  isContextPanelOpen: boolean;
  leftSidebarCollapsed: boolean;
  leftPanelMode: 'sessions' | 'plugins' | 'settings';
  workbench: {
    items: WorkbenchItem[];
    activeItemId: string | null;
    layoutMode: 'split' | 'focus';
  } | null;
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
  setLeftPanelMode: (mode: UiSliceState['leftPanelMode']) => void;
  openWorkbench: (workbench: Omit<WorkbenchItem, 'id'> & { id?: string }) => void;
  closeWorkbench: () => void;
  closeWorkbenchItem: (id: string) => void;
  setActiveWorkbenchItem: (id: string) => void;
  setWorkbenchLayoutMode: (mode: 'split' | 'focus') => void;
  setComposerControls: (updates: Partial<UiSliceState['composerControls']>) => void;
}

export type UiSlice = UiSliceState & UiSliceActions;

const buildWorkbenchId = (workbench: Omit<WorkbenchItem, 'id'> & { id?: string }) =>
  workbench.id || `${workbench.mode}:${workbench.meta?.path || workbench.meta?.url || workbench.meta?.summary || workbench.title}`;

export const createUiSlice = (
  set: (partial: Partial<UiSliceState> | ((state: UiSliceState) => Partial<UiSliceState>)) => void,
): UiSliceState & UiSliceActions => ({
  isContextPanelOpen: false,
  leftSidebarCollapsed: false,
  leftPanelMode: 'sessions',
  workbench: null,
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
  setLeftPanelMode: (mode) =>
    set({
      leftPanelMode: mode,
      workbench: mode === 'sessions' ? null : undefined,
    }),
  openWorkbench: (workbench) =>
    set((state) => {
      const id = buildWorkbenchId(workbench);
      const nextItem: WorkbenchItem = { ...workbench, id, isOpen: true };
      const existingItems = state.workbench?.items || [];
      const existingIndex = existingItems.findIndex((item) => item.id === id);
      const items = existingIndex >= 0
        ? existingItems.map((item, index) => (index === existingIndex ? nextItem : item))
        : [...existingItems, nextItem];

      return {
        workbench: {
          items,
          activeItemId: id,
          layoutMode: state.workbench?.layoutMode || 'split',
        },
      };
    }),
  closeWorkbench: () => set({ workbench: null }),
  closeWorkbenchItem: (id) =>
    set((state) => {
      const items = state.workbench?.items.filter((item) => item.id !== id) || [];
      if (items.length === 0) {
        return { workbench: null };
      }
      const activeItemId = state.workbench?.activeItemId === id ? items[items.length - 1].id : state.workbench?.activeItemId || items[0].id;
      return {
        workbench: {
          items,
          activeItemId,
          layoutMode: state.workbench?.layoutMode || 'split',
        },
      };
    }),
  setActiveWorkbenchItem: (id) =>
    set((state) => ({
      workbench: state.workbench
        ? { ...state.workbench, activeItemId: id }
        : state.workbench,
    })),
  setWorkbenchLayoutMode: (mode) =>
    set((state) => ({
      workbench: state.workbench ? { ...state.workbench, layoutMode: mode } : state.workbench,
    })),
  setComposerControls: (updates) =>
    set((state) => ({
      composerControls: {
        ...state.composerControls,
        ...updates,
      },
    })),
});
