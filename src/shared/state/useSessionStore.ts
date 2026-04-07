import { create } from 'zustand';
import type { Session } from '@/shared/types/schema';
import { createSessionSlice, type SessionSlice } from './slices/sessionSlice';
import { createMessageSlice, type MessageSlice } from './slices/messageSlice';
import { createUiSlice, type UiSlice } from './slices/uiSlice';

type SessionStore = SessionSlice & MessageSlice & UiSlice;

export const useSessionStore = create<SessionStore>((set, get) => ({
  ...createSessionSlice(set, get),
  ...createMessageSlice(set, get),
  ...createUiSlice(set),
}));

export function useSessions(): Session[] {
  const sessions = useSessionStore((s) => s.sessions);
  return Array.from(sessions.values()).sort((a, b) => {
    const updatedDiff = b.updatedAt - a.updatedAt;
    if (updatedDiff !== 0) return updatedDiff;
    return a.id.localeCompare(b.id);
  });
}

export function useActiveSession(): Session | undefined {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  if (!activeSessionId) return undefined;
  return sessions.get(activeSessionId);
}

export function useSession(sessionId: string | null): Session | undefined {
  const sessions = useSessionStore((s) => s.sessions);
  if (!sessionId) return undefined;
  return sessions.get(sessionId);
}
