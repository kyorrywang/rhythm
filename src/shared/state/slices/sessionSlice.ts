import type { Session } from '@/shared/types/schema';
import { persistSession, removePersistedSession } from '@/shared/lib/sessionPersistence';
import { DEFAULT_WORKSPACE_PATH, normalizeWorkspacePath } from '@/shared/state/useWorkspaceStore';

interface SessionSliceState {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  flowStep: number;
}

interface SessionSliceActions {
  setActiveSession: (id: string | null) => void;
  hydrateWorkspaceSessions: (workspacePath: string, sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  togglePinnedSession: (id: string) => void;
  archiveSession: (id: string) => void;
  restoreSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  setSessionTitle: (id: string, title: string) => void;
  grantSessionPermission: (id: string, toolName: string) => void;
  setFlowStep: (step: number) => void;
  setTaskMinimized: (sessionId: string, minimized: boolean) => void;
  toggleTaskMinimized: () => void;
  toggleAppendMinimized: () => void;
  navigateBack: () => void;
}

export type SessionSlice = SessionSliceState & SessionSliceActions;

export const createSessionSlice = (
  set: (partial: Partial<SessionSliceState> | ((state: SessionSliceState) => Partial<SessionSliceState>)) => void,
  get: () => SessionSliceState,
): SessionSliceState & SessionSliceActions => ({
  sessions: new Map(),
  activeSessionId: null,
  flowStep: 0,

  setActiveSession: (id) =>
    set((state) => {
      if (!id) return { activeSessionId: null };
      const session = state.sessions.get(id);
      if (!session) return { activeSessionId: id };
      const next = new Map(state.sessions);
      const updated = { ...session, hasUnreadCompleted: false };
      next.set(id, updated);
      persistSession(updated);
      return { activeSessionId: id, sessions: next };
    }),

  hydrateWorkspaceSessions: (workspacePath, sessions) =>
    set((state) => {
      const targetWorkspacePath = normalizeWorkspacePath(workspacePath);
      const loadedIds = new Set(sessions.map((session) => session.id));
      const next = new Map<string, Session>();

      for (const [id, session] of state.sessions.entries()) {
        const sessionWorkspacePath = normalizeWorkspacePath(session.workspacePath || DEFAULT_WORKSPACE_PATH);
        const belongsToTargetWorkspace = sessionWorkspacePath === targetWorkspacePath;

        if (!belongsToTargetWorkspace) {
          next.set(id, session);
          continue;
        }

        const runtimeState = session.runtime?.state || 'idle';
        const shouldPreserveLocalSession =
          !loadedIds.has(id)
          && (
            !['idle', 'completed', 'failed', 'interrupted'].includes(runtimeState)
            || (state.activeSessionId === id && session.messages.length > 0)
          );

        if (shouldPreserveLocalSession) {
          next.set(id, session);
        }
      }

      for (const session of sessions) {
        next.set(session.id, session);
      }

      return {
        sessions: next,
      };
    }),

  addSession: (session) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.set(session.id, session);
      persistSession(session);
      return { sessions: next };
    }),

  togglePinnedSession: (id) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return state;
      const next = new Map(state.sessions);
      const updated = { ...session, pinned: !(session.pinned ?? false), updatedAt: Date.now() };
      next.set(id, updated);
      persistSession(updated);
      return { sessions: next };
    }),

  archiveSession: (id) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return state;
      const next = new Map(state.sessions);
      const updated = { ...session, archived: true, hasUnreadCompleted: false, updatedAt: Date.now() };
      next.set(id, updated);
      persistSession(updated);
      return {
        sessions: next,
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      };
    }),

  restoreSession: (id) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return state;
      const next = new Map(state.sessions);
      const updated = { ...session, archived: false, updatedAt: Date.now() };
      next.set(id, updated);
      persistSession(updated);
      return { sessions: next };
    }),

  renameSession: (id, title) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return state;
      const next = new Map(state.sessions);
      const updated = { ...session, title, updatedAt: Date.now() };
      next.set(id, updated);
      persistSession(updated);
      return { sessions: next };
    }),

  setSessionTitle: (id, title) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return state;
      const next = new Map(state.sessions);
      const updated = { ...session, title, updatedAt: Date.now() };
      next.set(id, updated);
      persistSession(updated);
      return { sessions: next };
    }),

  grantSessionPermission: (id, toolName) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return state;
      const grants = session.permissionGrants ?? [];
      if (grants.includes(toolName)) return state;
      const next = new Map(state.sessions);
      const updated = {
        ...session,
        permissionGrants: [...grants, toolName],
      };
      next.set(id, updated);
      persistSession(updated);
      return { sessions: next };
    }),

  removeSession: (id) =>
    set((state) => {
      const next = new Map(state.sessions);
      const session = next.get(id);
      next.delete(id);
      if (session) {
        removePersistedSession(session);
      }
      return {
        sessions: next,
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      };
    }),

  updateSession: (id, updates) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return state;
      const next = new Map(state.sessions);
      const updated = { ...session, ...updates, updatedAt: Date.now() };
      next.set(id, updated);
      persistSession(updated);
      return { sessions: next };
    }),

  setFlowStep: (step) => set({ flowStep: step }),

  setTaskMinimized: (sessionId, minimized) =>
    set((state) => {
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      const next = new Map(state.sessions);
      const updated = { ...session, taskDockMinimized: minimized };
      next.set(sessionId, updated);
      persistSession(updated);
      return { sessions: next };
    }),

  toggleTaskMinimized: () =>
    set((state) => {
      const sessionId = state.activeSessionId;
      if (!sessionId) return state;
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      const next = new Map(state.sessions);
      const updated = {
        ...session,
        taskDockMinimized: !(session.taskDockMinimized ?? false),
      };
      next.set(sessionId, updated);
      persistSession(updated);
      return { sessions: next };
    }),

  toggleAppendMinimized: () =>
    set((state) => {
      const sessionId = state.activeSessionId;
      if (!sessionId) return state;
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      const next = new Map(state.sessions);
      const updated = {
        ...session,
        appendDockMinimized: !(session.appendDockMinimized ?? false),
      };
      next.set(sessionId, updated);
      persistSession(updated);
      return { sessions: next };
    }),

  navigateBack: () => {
    const state = get();
    const active = state.activeSessionId ? state.sessions.get(state.activeSessionId) : null;
    if (active?.parentId) {
      set({ activeSessionId: active.parentId });
    }
  },
});
