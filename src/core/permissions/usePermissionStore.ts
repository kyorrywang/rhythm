import { create } from 'zustand';

export type PermissionMode = 'default' | 'plan' | 'full_auto';

export interface PermissionConfig {
  mode: PermissionMode;
  allowedTools: string[];
  deniedTools: string[];
}

interface PermissionState {
  pendingPermissions: Map<string, PermissionRequest>;
  config: PermissionConfig;
  addPending: (request: PermissionRequest) => void;
  resolvePending: (toolId: string, approved: boolean) => void;
  setConfig: (config: Partial<PermissionConfig>) => void;
  clearPending: () => void;
}

export interface PermissionRequest {
  toolId: string;
  toolName: string;
  reason: string;
  sessionId: string;
  timestamp: number;
}

export const usePermissionStore = create<PermissionState>((set) => ({
  pendingPermissions: new Map(),
  config: {
    mode: 'default',
    allowedTools: [],
    deniedTools: [],
  },

  addPending: (request) =>
    set((state) => {
      const next = new Map(state.pendingPermissions);
      next.set(request.toolId, request);
      return { pendingPermissions: next };
    }),

  resolvePending: (toolId, _approved) =>
    set((state) => {
      const next = new Map(state.pendingPermissions);
      next.delete(toolId);
      return { pendingPermissions: next };
    }),

  setConfig: (config) =>
    set((state) => ({
      config: { ...state.config, ...config },
    })),

  clearPending: () => set({ pendingPermissions: new Map() }),
}));
