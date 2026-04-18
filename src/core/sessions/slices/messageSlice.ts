import type { AskResponse, Message, MessageSegment, ServerEventChunk, Session, QueuedMessage, SessionQueueState } from '@/shared/types/schema';
import { reduceSessionChunk } from '@/core/sessions/sessionChunkReducer';
import { persistSession } from '@/core/sessions/sessionPersistence';

interface MessageSliceState {
}

interface MessageSliceActions {
  addMessage: (sessionId: string, message: Message) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<Message>) => void;
  rewindSessionToMessage: (sessionId: string, messageId: string) => void;
  enqueueMessage: (sessionId: string, message: Message, priority: 'normal' | 'urgent', mode?: 'normal' | 'build' | 'task' | 'ask' | 'append') => void;
  dequeueMessage: (sessionId: string) => QueuedMessage | null;
  removeQueuedMessage: (sessionId: string, queuedMessageId: string) => void;
  clearQueue: (sessionId: string) => void;
  getQueueLength: (sessionId: string) => number;
  setQueueState: (sessionId: string, queueState: SessionQueueState) => void;
  clearAskRequest: (sessionId: string) => void;
  recordAskAnswer: (sessionId: string, messageId: string, answer: AskResponse) => void;
  clearTasks: (sessionId: string) => void;
  resolvePermissionRequestInTimeline: (sessionId: string, toolId: string, approved: boolean) => void;
  processChunk: (sessions: Map<string, Session>, sessionId: string, messageId: string, chunk: ServerEventChunk) => { sessions: Map<string, Session>; activeSessionId?: string | null };
  migrateQueueToChild: (parentSessionId: string, childSessionId: string, sessions: Map<string, Session>) => Map<string, Session>;
  restoreQueueToParent: (childSessionId: string, parentSessionId: string, sessions: Map<string, Session>) => Map<string, Session>;
}

export type MessageSlice = MessageSliceState & MessageSliceActions;

type SessionBackedState = {
  sessions: Map<string, Session>;
};

export const createMessageSlice = (
  set: (partial: Partial<SessionBackedState> | ((state: SessionBackedState) => Partial<SessionBackedState>)) => void,
  get: () => SessionBackedState,
): MessageSliceState & MessageSliceActions => ({
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
      const messages: Message[] = session.messages.map((msg) =>
        msg.id === messageId ? ({ ...msg, ...updates } as Message) : msg,
      );
      const updated: Session = {
        ...session,
        messages,
        updatedAt: Date.now(),
      };
      nextSessions.set(sessionId, updated);
      persistSession(updated);
      return { sessions: nextSessions };
    }),

  rewindSessionToMessage: (sessionId, messageId) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;

      const targetIndex = session.messages.findIndex((msg) => msg.id === messageId);
      if (targetIndex < 0) return state;

      const updated: Session = {
        ...session,
        messages: session.messages.slice(0, targetIndex),
        queuedMessages: [],
        queueState: 'idle',
        hasUnreadCompleted: false,
        error: null,
        runtime: {
          state: 'idle',
          updatedAt: Date.now(),
        },
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

  setQueueState: (sessionId, queueState) =>
    set((state) => {
      const nextSessions = new Map(state.sessions);
      const session = nextSessions.get(sessionId);
      if (!session) return state;
      const updated = {
        ...session,
        queueState,
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
      const updated = { ...session, updatedAt: Date.now() };
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

  clearTasks: (_sessionId) =>
    set((state) => {
      return state;
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
      sessions: new Map(result.sessions.map((s: Session) => [s.id, s])),
      activeSessionId: result.activeSessionId,
    };
  },

  migrateQueueToChild: (_parentSessionId, _childSessionId, sessions) => {
    return sessions;
  },

  restoreQueueToParent: (_childSessionId, _parentSessionId, sessions) => {
    return sessions;
  },
});
