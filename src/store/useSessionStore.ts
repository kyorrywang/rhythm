import { create } from 'zustand';
import { Session, Message, ServerEventChunk, QueuedMessage, SessionPhase } from '@/types/schema';
import { reduceSessionChunk } from '@/store/sessionChunkReducer';

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  flowStep: number;
  isTaskMinimized: boolean;
  isAppendMinimized: boolean;
  
  setActiveSession: (id: string) => void;
  addMessage: (sessionId: string, message: Message) => void;
  enqueueMessage: (sessionId: string, message: Message, priority: 'normal' | 'urgent') => void;
  dequeueMessage: (sessionId: string) => QueuedMessage | null;
  removeQueuedMessage: (sessionId: string, queuedMessageId: string) => void;
  clearQueue: (sessionId: string) => void;
  getQueueLength: (sessionId: string) => number;
  transitionPhase: (sessionId: string, phase: SessionPhase) => void;
  setFlowStep: (step: number) => void;
  toggleTaskMinimized: () => void;
  toggleAppendMinimized: () => void;
  processChunk: (sessionId: string, messageId: string, chunk: ServerEventChunk) => void;
  navigateBack: () => void;
  setSessionRunning: (sessionId: string, running: boolean) => void;
  clearAskRequest: (sessionId: string) => void;
  recordAskAnswer: (sessionId: string, messageId: string, answer: { selected: string[]; text: string }) => void;
  clearTasks: (sessionId: string) => void;
  migrateQueueToChild: (parentSessionId: string, childSessionId: string) => void;
  restoreQueueToParent: (childSessionId: string, parentSessionId: string) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [
    {
      id: '1',
      title: '响应式会话演示',
      updatedAt: Date.now(),
      running: false,
      phase: 'idle',
      messages: [],
      queuedMessages: [],
    }
  ],
  activeSessionId: '1',
  flowStep: 0,
  isTaskMinimized: false,
  isAppendMinimized: false,

  setActiveSession: (id) => set({ activeSessionId: id }),
  setFlowStep: (step) => set({ flowStep: step }),
  toggleTaskMinimized: () => set((state) => ({ isTaskMinimized: !state.isTaskMinimized })),
  toggleAppendMinimized: () => set((state) => ({ isAppendMinimized: !state.isAppendMinimized })),
  
  addMessage: (sessionId, message) => set((state) => ({
    sessions: state.sessions.map(s => 
      s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s
    )
  })),

  enqueueMessage: (sessionId, message, priority) => set((state) => ({
    sessions: state.sessions.map(s => {
      if (s.id !== sessionId) return s;
      const existing = s.queuedMessages || [];
      const queued: QueuedMessage = {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
        priority,
        createdAt: Date.now(),
      };
      const sorted = [...existing, queued].sort((a, b) => {
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
        return a.createdAt - b.createdAt;
      });
      return { ...s, queuedMessages: sorted };
    })
  })),

  dequeueMessage: (sessionId) => {
    let result: QueuedMessage | null = null;
    set((state) => ({
      sessions: state.sessions.map(s => {
        if (s.id !== sessionId || !s.queuedMessages || s.queuedMessages.length === 0) return s;
        result = s.queuedMessages[0];
        return { ...s, queuedMessages: s.queuedMessages.slice(1) };
      })
    }));
    return result;
  },

  removeQueuedMessage: (sessionId, queuedMessageId) => set((state) => ({
    sessions: state.sessions.map(s => {
      if (s.id !== sessionId) return s;
      return { ...s, queuedMessages: (s.queuedMessages || []).filter(q => q.id !== queuedMessageId) };
    })
  })),

  clearQueue: (sessionId) => set((state) => ({
    sessions: state.sessions.map(s => {
      if (s.id !== sessionId) return s;
      return { ...s, queuedMessages: [] };
    })
  })),

  getQueueLength: (sessionId) => {
    const state = get();
    const session = state.sessions.find(s => s.id === sessionId);
    return session?.queuedMessages?.length || 0;
  },

  transitionPhase: (sessionId, phase) => set((state) => ({
    sessions: state.sessions.map(s => {
      if (s.id !== sessionId) return s;
      return { ...s, phase };
    })
  })),

  setSessionRunning: (sessionId, running) => set((state) => ({
    sessions: state.sessions.map(s =>
      s.id === sessionId ? { ...s, running } : s
    )
  })),

  clearAskRequest: (sessionId) => set((state) => ({
    sessions: state.sessions.map(s =>
      s.id === sessionId ? { ...s, currentAsk: null } : s
    )
  })),

  recordAskAnswer: (sessionId: string, messageId: string, answer: { selected: string[]; text: string }) => set((state) => ({
    sessions: state.sessions.map(s => {
      if (s.id !== sessionId) return s;
      return {
        ...s,
        currentAsk: null,
        messages: s.messages.map(m => {
          if (m.id !== messageId || !m.segments) return m;
          return {
            ...m,
            segments: m.segments.map(seg =>
              seg.type === 'ask' && seg.status === 'waiting'
                ? { ...seg, status: 'answered' as const, answer }
                : seg,
            ),
            status: 'running' as const,
          };
        }),
      };
    })
  })),

  clearTasks: (sessionId) => set((state) => ({
    sessions: state.sessions.map(s =>
      s.id === sessionId ? { ...s, currentTasks: [] } : s
    )
  })),

  navigateBack: () => set((state) => {
    const active = state.sessions.find(s => s.id === state.activeSessionId);
    if (active && active.parentId) {
      return { activeSessionId: active.parentId };
    }
    return state;
  }),

  migrateQueueToChild: (parentSessionId, childSessionId) => set((state) => {
    const parent = state.sessions.find(s => s.id === parentSessionId);
    if (!parent || !parent.queuedMessages || parent.queuedMessages.length === 0) return state;
    return {
      sessions: state.sessions.map(s => {
        if (s.id === parentSessionId) return { ...s, queuedMessages: [] };
        if (s.id === childSessionId) return { ...s, queuedMessages: [...parent.queuedMessages!] };
        return s;
      })
    };
  }),

  restoreQueueToParent: (childSessionId, parentSessionId) => set((state) => {
    const child = state.sessions.find(s => s.id === childSessionId);
    const remaining = child?.queuedMessages || [];
    if (remaining.length === 0) return state;
    return {
      sessions: state.sessions.map(s => {
        if (s.id === childSessionId) return { ...s, queuedMessages: [] };
        if (s.id === parentSessionId) return { ...s, queuedMessages: [...(s.queuedMessages || []), ...remaining] };
        return s;
      })
    };
  }),

  processChunk: (sessionId: string, messageId: string, chunk: ServerEventChunk) => {
    const state = get();
    const result = reduceSessionChunk(state.sessions, sessionId, messageId, chunk);

    set({
      sessions: result.sessions,
      ...(result.activeSessionId !== undefined ? { activeSessionId: result.activeSessionId } : {}),
    });

    for (const effect of result.effects) {
      if (effect.type === 'schedule_thinking_end') {
        setTimeout(() => {
          get().processChunk(effect.sessionId, effect.messageId, {
            type: 'thinking_end',
            sessionId: effect.sessionId,
            timeCostMs: effect.timeCostMs,
          });
        }, effect.delayMs);
      }
    }
  }

}));
