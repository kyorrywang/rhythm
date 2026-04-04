import { create } from 'zustand';
import { Session, Message, ServerEventChunk } from '@/types/schema';

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  flowStep: number;
  isThinkingExpanded: boolean;
  
  setActiveSession: (id: string) => void;
  addMessage: (sessionId: string, message: Message) => void;
  setFlowStep: (step: number) => void;
  setThinkingExpanded: (expanded: boolean) => void;
  processChunk: (sessionId: string, messageId: string, chunk: ServerEventChunk) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [
    {
      id: '1',
      title: '响应式会话演示',
      updatedAt: Date.now(),
      running: false,
      messages: [],
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

  processChunk: (sessionId: string, messageId: string, chunk: any) => set((state) => {
    return {
      sessions: state.sessions.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map(m => {
            if (m.id !== messageId) return m;
            
            // Handle chunk types deeply
            if (chunk.type === 'text_delta') {
              return { ...m, content: (m.content || '') + chunk.content };
            }
            if (chunk.type === 'thinking_end') {
              return { ...m, isThinking: false, thinkingTimeCostMs: chunk.timeCostMs };
            }
            if (chunk.type === 'tool_start') {
              const newTool = { id: chunk.toolId, name: chunk.toolName, arguments: chunk.args, status: 'running' as const, logs: [] };
              return { ...m, toolCalls: [...(m.toolCalls || []), newTool] };
            }
            if (chunk.type === 'tool_output') {
              return {
                ...m,
                toolCalls: m.toolCalls?.map(t => 
                  t.id === chunk.toolId ? { ...t, logs: [...(t.logs || []), chunk.logLine] } : t
                )
              };
            }
            if (chunk.type === 'tool_end') {
              return {
                ...m,
                toolCalls: m.toolCalls?.map(t => 
                  t.id === chunk.toolId ? { ...t, status: chunk.exitCode === 0 ? 'completed' : 'error' } : t
                )
              };
            }
            return m;
          })
        };
      })
    };
  })

}));
