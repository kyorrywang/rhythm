interface UiSliceState {
  isContextPanelOpen: boolean;
  isSettingsOpen: boolean;
}

interface UiSliceActions {
  setContextPanelOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}

export type UiSlice = UiSliceState & UiSliceActions;

export const createUiSlice = (
  set: (partial: Partial<UiSliceState>) => void,
): UiSliceState & UiSliceActions => ({
  isContextPanelOpen: false,
  isSettingsOpen: false,

  setContextPanelOpen: (open) => set({ isContextPanelOpen: open }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
});
