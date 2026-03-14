import { create } from 'zustand';

export type ActivityTab = 'sessions' | 'explorer' | 'workflows' | 'settings';

interface AppState {
  // Global / Workspace
  workspacePath: string;
  setWorkspacePath: (path: string) => void;

  // Sidebar Layout
  activeTab: ActivityTab;
  setActiveTab: (tab: ActivityTab) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  // Session
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;

  // Artifact Panel
  activeArtifact: { id: string; type: string; title: string; content?: any } | null;
  setActiveArtifact: (artifact: { id: string; type: string; title: string; content?: any } | null) => void;
  isArtifactPanelOpen: boolean;
  toggleArtifactPanel: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  workspacePath: localStorage.getItem('rhythm_workspace') || '',
  setWorkspacePath: (path) => {
    localStorage.setItem('rhythm_workspace', path);
    set({ workspacePath: path });
  },

  activeTab: 'sessions',
  setActiveTab: (tab) => set({ activeTab: tab, isSidebarOpen: true }),
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  currentSessionId: null,
  setCurrentSessionId: (id) => set({ currentSessionId: id }),

  activeArtifact: null,
  setActiveArtifact: (artifact) => set({ 
    activeArtifact: artifact, 
    isArtifactPanelOpen: !!artifact 
  }),
  isArtifactPanelOpen: false,
  toggleArtifactPanel: () => set((state) => ({ isArtifactPanelOpen: !state.isArtifactPanelOpen })),
}));
