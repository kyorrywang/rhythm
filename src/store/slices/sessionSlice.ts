import type { Session } from '@/types/schema';
import { savePersistedSessions } from '@/lib/sessionPersistence';

interface SessionSliceState {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  flowStep: number;
}

interface SessionSliceActions {
  setActiveSession: (id: string) => void;
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
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

  setActiveSession: (id) => set({ activeSessionId: id }),

  setSessions: (sessions) => {
    savePersistedSessions(sessions);
    set({
      sessions: new Map(sessions.map((s) => [s.id, s])),
    });
  },

  addSession: (session) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.set(session.id, session);
      savePersistedSessions(Array.from(next.values()));
      return { sessions: next };
    }),

  removeSession: (id) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.delete(id);
      savePersistedSessions(Array.from(next.values()));
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
      next.set(id, { ...session, ...updates, updatedAt: Date.now() });
      savePersistedSessions(Array.from(next.values()));
      return { sessions: next };
    }),

  setFlowStep: (step) => set({ flowStep: step }),

  setTaskMinimized: (sessionId, minimized) =>
    set((state) => {
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      const next = new Map(state.sessions);
      next.set(sessionId, { ...session, taskDockMinimized: minimized });
      savePersistedSessions(Array.from(next.values()));
      return { sessions: next };
    }),

  toggleTaskMinimized: () =>
    set((state) => {
      const sessionId = state.activeSessionId;
      if (!sessionId) return state;
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      const next = new Map(state.sessions);
      next.set(sessionId, {
        ...session,
        taskDockMinimized: !(session.taskDockMinimized ?? false),
      });
      savePersistedSessions(Array.from(next.values()));
      return { sessions: next };
    }),

  toggleAppendMinimized: () =>
    set((state) => {
      const sessionId = state.activeSessionId;
      if (!sessionId) return state;
      const session = state.sessions.get(sessionId);
      if (!session) return state;
      const next = new Map(state.sessions);
      next.set(sessionId, {
        ...session,
        appendDockMinimized: !(session.appendDockMinimized ?? false),
      });
      savePersistedSessions(Array.from(next.values()));
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
