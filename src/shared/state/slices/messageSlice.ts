import type { Message, MessageSegment, ServerEventChunk, Session, QueuedMessage, Task, AskRequest } from '@/shared/types/schema';
import { reduceSessionChunk } from '@/shared/state/sessionChunkReducer';
import { persistSession } from '@/shared/lib/sessionPersistence';

interface MessageSliceState {
  messages: Map<string, Message>;
  queuedMessages: Map<string, QueuedMessage[]>;
  currentAsk: Map<string, AskRequest | null>;
  currentTasks: Map<string, Task[]>;
}

interface MessageSliceActions {
  addMessage: (sessionId: string, message: Message) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<Message>) => void;
  enqueueMessage: (sessionId: string, message: Message, priority: 'normal' | 'urgent', mode?: 'normal' | 'build' | 'task' | 'ask' | 'append') => void;
  dequeueMessage: (sessionId: string) => QueuedMessage | null;
  removeQueuedMessage: (sessionId: string, queuedMessageId: string) => void;
  clearQueue: (sessionId: string) => void;
  getQueueLength: (sessionId: string) => number;
  transitionPhase: (sessionId: string, phase: Session['phase']) => void;
  clearAskRequest: (sessionId: string) => void;
  recordAskAnswer: (sessionId: string, messageId: string, answer: { selected: string[]; text: string }) => void;
  clearTasks: (sessionId: string) => void;
  resolvePermissionRequestInTimeline: (sessionId: string, toolId: string, approved: boolean) => void;
  processChunk: (sessions: Map<string, Session>, sessionId: string, messageId: string, chunk: ServerEventChunk) => { sessions: Map<string, Session>; activeSessionId?: string | null };
  migrateQueueToChild: (parentSessionId: string, childSessionId: string, sessions: Map<string, Session>) => Map<string, Session>;
  restoreQueueToParent: (childSessionId: string, parentSessionId: string, sessions: Map<string, Session>) => Map<string, Session>;
}

export type MessageSlice = MessageSliceState & MessageSliceActions;

type SessionBackedState = MessageSliceState & {
  sessions: Map<string, Session>;
};

export const createMessageSlice = (
  set: (partial: Partial<SessionBackedState> | ((state: SessionBackedState) => Partial<SessionBackedState>)) => void,
  get: () => SessionBackedState,
): MessageSliceState & MessageSliceActions => ({
  messages: new Map(),
  queuedMessages: new Map(),
  currentAsk: new Map(),
  currentTasks: new Map(),

  addMessage: (sessionId, message) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;
      const updated: Session = {
        ...session,
        messages: [...session.messages, message],
        updatedAt: Date.now(),
      };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  updateMessage: (sessionId, messageId, updates) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;
      const updated = {
        ...session,
        messages: session.messages.map((msg) =>
          msg.id === messageId ? { ...msg, ...updates } : msg,
        ),
        updatedAt: Date.now(),
      };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  enqueueMessage: (sessionId, message, priority, mode) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;
      const existing = session.queuedMessages || [];
      const queued: QueuedMessage = {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
        mode,
        priority,
        createdAt: Date.now(),
      };
      const sorted = [...existing, queued].sort((a, b) => {
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
        return a.createdAt - b.createdAt;
      });
      const updated = { ...session, queuedMessages: sorted, updatedAt: Date.now() };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  dequeueMessage: (sessionId) => {
    let result: QueuedMessage | null = null;
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      const queue = session?.queuedMessages;
      if (!session || !queue || queue.length === 0) return state;
      result = queue[0];
      const updated = {
        ...session,
        queuedMessages: queue.slice(1),
        updatedAt: Date.now(),
      };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    });
    return result;
  },

  removeQueuedMessage: (sessionId, queuedMessageId) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      const queue = session?.queuedMessages;
      if (!session || !queue) return state;
      const updated = {
        ...session,
        queuedMessages: queue.filter((q) => q.id !== queuedMessageId),
        updatedAt: Date.now(),
      };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  clearQueue: (sessionId) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;
      const updated = { ...session, queuedMessages: [], updatedAt: Date.now() };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  getQueueLength: (sessionId) => {
    const state = get();
    return state.sessions.get(sessionId)?.queuedMessages?.length || 0;
  },

  transitionPhase: (sessionId, phase) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;
      const updated = {
        ...session,
        phase,
        currentAsk: phase !== 'waiting_for_ask' ? null : session.currentAsk,
        updatedAt: Date.now(),
      };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  clearAskRequest: (sessionId) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;
      const updated = { ...session, currentAsk: null, updatedAt: Date.now() };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  recordAskAnswer: (sessionId, messageId, answer) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;
      const updated = {
        ...session,
        currentAsk: null,
        messages: session.messages.map((msg) =>
          msg.id !== messageId || !msg.segments
            ? msg
            : {
                ...msg,
                status: 'running' as const,
                segments: msg.segments.map((seg: MessageSegment) =>
                  seg.type === 'ask' && seg.status === 'waiting'
                    ? { ...seg, status: 'answered' as const, answer }
                    : seg,
                ),
              },
        ),
        updatedAt: Date.now(),
      };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  clearTasks: (sessionId) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;
      if (!session.currentTasks?.length) return state;
      const updated = { ...session, currentTasks: [] };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  resolvePermissionRequestInTimeline: (sessionId, toolId, approved) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;

      const updated = {
        ...session,
        messages: session.messages.map((msg) =>
          !msg.segments
            ? msg
            : {
                ...msg,
                segments: msg.segments.map((seg) =>
                  seg.type === 'permission' && seg.request.toolId === toolId
                    ? { ...seg, status: approved ? 'approved' as const : 'denied' as const }
                    : seg,
                ),
              },
        ),
        updatedAt: Date.now(),
      };
      nextSessions.set(sessionId, updated);
      persistSession(updated);

      return { sessions: nextSessions };
    }),

  processChunk: (sessions, sessionId, messageId, chunk) => {
    const sessionsArray = Array.from(sessions.values());
    const result = reduceSessionChunk(sessionsArray, sessionId, messageId, chunk);
    return {
      sessions: new Map(result.sessions.map((s) => [s.id, s])),
      activeSessionId: result.activeSessionId,
    };
  },

  migrateQueueToChild: (parentSessionId, childSessionId, sessions) => {
    const parent = sessions.get(parentSessionId);
    if (!parent?.queuedMessages?.length) return sessions;
    const next = new Map(sessions);
    const parentSession = next.get(parentSessionId);
    if (parentSession) {
      next.set(parentSessionId, { ...parentSession, queuedMessages: [] });
    }
    const childSession = next.get(childSessionId);
    if (childSession) {
      next.set(childSessionId, { ...childSession, queuedMessages: [...parent.queuedMessages] });
    }
    return next;
  },

  restoreQueueToParent: (childSessionId, parentSessionId, sessions) => {
    const child = sessions.get(childSessionId);
    const remaining = child?.queuedMessages || [];
    if (remaining.length === 0) return sessions;
    const next = new Map(sessions);
    const childSession = next.get(childSessionId);
    if (childSession) {
      next.set(childSessionId, { ...childSession, queuedMessages: [] });
    }
    const parentSession = next.get(parentSessionId);
    if (parentSession) {
      next.set(parentSessionId, { ...parentSession, queuedMessages: [...(parentSession.queuedMessages || []), ...remaining] });
    }
    return next;
  },
});
