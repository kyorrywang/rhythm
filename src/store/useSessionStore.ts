import { create } from 'zustand';
import { Session, Message, ServerEventChunk } from '@/types/schema';
import { reduceSessionChunk } from '@/store/sessionChunkReducer';

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  flowStep: number;
  isThinkingExpanded: boolean;
  
  setActiveSession: (id: string) => void;
  addMessage: (sessionId: string, message: Message) => void;
  queueMessage: (sessionId: string, message: Message) => void;
  popQueuedMessage: (sessionId: string) => Message | null;
  setFlowStep: (step: number) => void;
  setThinkingExpanded: (expanded: boolean) => void;
  processChunk: (sessionId: string, messageId: string, chunk: ServerEventChunk) => void;
  navigateBack: () => void;
  setSessionRunning: (sessionId: string, running: boolean) => void;
  clearAskRequest: (sessionId: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [
    {
      id: '1',
      title: '响应式会话演示',
      updatedAt: Date.now(),
      running: false,
      messages: [],
      queuedMessages: [],
    }
  ],
  activeSessionId: '1',
  flowStep: 0,
  isThinkingExpanded: false,

  setActiveSession: (id) => set({ activeSessionId: id }),
  setFlowStep: (step) => set({ flowStep: step }),
  setThinkingExpanded: (exp) => set({ isThinkingExpanded: exp }),
  
  addMessage: (sessionId, message) => set((state) => ({
    sessions: state.sessions.map(s => 
      s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s
    )
  })),

  queueMessage: (sessionId, message) => set((state) => ({
    sessions: state.sessions.map(s => 
      s.id === sessionId ? { ...s, queuedMessages: [...(s.queuedMessages || []), message] } : s
    )
  })),

  popQueuedMessage: (sessionId) => {
    let msg: Message | null = null;
    set((state) => {
      return {
        sessions: state.sessions.map(s => {
          if (s.id === sessionId && s.queuedMessages && s.queuedMessages.length > 0) {
            msg = s.queuedMessages[0];
            return { ...s, queuedMessages: s.queuedMessages.slice(1) };
          }
          return s;
        })
      };
    });
    return msg;
  },

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

  navigateBack: () => set((state) => {
    const active = state.sessions.find(s => s.id === state.activeSessionId);
    if (active && active.parentId) {
      return { activeSessionId: active.parentId };
    }
    return state;
  }),

  processChunk: (sessionId: string, messageId: string, chunk: ServerEventChunk) => {
    const state = useSessionStore.getState();
    const result = reduceSessionChunk(state.sessions, sessionId, messageId, chunk);

    set({
      sessions: result.sessions,
      ...(result.activeSessionId !== undefined ? { activeSessionId: result.activeSessionId } : {}),
    });

    for (const effect of result.effects) {
      if (effect.type === 'schedule_thinking_end') {
        setTimeout(() => {
          useSessionStore.getState().processChunk(effect.sessionId, effect.messageId, {
            type: 'thinking_end',
            timeCostMs: effect.timeCostMs,
          });
        }, effect.delayMs);
      }
    }
  }

}));
