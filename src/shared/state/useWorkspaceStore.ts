import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

export const DEFAULT_WORKSPACE_PATH = 'C:\\Users\\Administrator\\Documents\\dev\\rhythm';

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  addWorkspace: (path: string) => Workspace;
  removeWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [createWorkspace(DEFAULT_WORKSPACE_PATH)],
      activeWorkspaceId: workspaceIdFromPath(DEFAULT_WORKSPACE_PATH),

      addWorkspace: (path) => {
        const workspace = createWorkspace(path);
        set((state) => {
          const existing = state.workspaces.find((item) => item.id === workspace.id);
          return {
            workspaces: existing ? state.workspaces : [...state.workspaces, workspace],
            activeWorkspaceId: workspace.id,
          };
        });
        return workspace;
      },

      removeWorkspace: (id) =>
        set((state) => {
          const nextWorkspaces = state.workspaces.filter((workspace) => workspace.id !== id);
          if (nextWorkspaces.length === 0) {
            const fallback = createWorkspace(DEFAULT_WORKSPACE_PATH);
            return {
              workspaces: [fallback],
              activeWorkspaceId: fallback.id,
            };
          }

          return {
            workspaces: nextWorkspaces,
            activeWorkspaceId:
              state.activeWorkspaceId === id ? nextWorkspaces[0].id : state.activeWorkspaceId,
          };
        }),

      setActiveWorkspace: (id) => {
        const exists = get().workspaces.some((workspace) => workspace.id === id);
        if (exists) {
          set({ activeWorkspaceId: id });
        }
      },
    }),
    {
      name: 'rhythm-workspaces-v1',
      onRehydrateStorage: () => (state) => {
        if (!state || state.workspaces.length > 0) return;
        const fallback = createWorkspace(DEFAULT_WORKSPACE_PATH);
        state.workspaces = [fallback];
        state.activeWorkspaceId = fallback.id;
      },
    },
  ),
);

export function useActiveWorkspace(): Workspace {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  return (
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ||
    workspaces[0] ||
    createWorkspace(DEFAULT_WORKSPACE_PATH)
  );
}

function createWorkspace(path: string): Workspace {
  const normalizedPath = normalizeWorkspacePath(path);
  return {
    id: workspaceIdFromPath(normalizedPath),
    name: getWorkspaceName(normalizedPath),
    path: normalizedPath,
    addedAt: Date.now(),
  };
}

function normalizeWorkspacePath(path: string) {
  return path.trim().replace(/[\\/]+$/, '');
}

function getWorkspaceName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function workspaceIdFromPath(path: string) {
  return normalizeWorkspacePath(path).toLowerCase();
}
