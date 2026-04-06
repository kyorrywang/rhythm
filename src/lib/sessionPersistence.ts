import type { Session } from '@/types/schema';

const STORAGE_KEY = 'rhythm.sessions.v1';

export function loadPersistedSessions(): Session[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Session[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePersistedSessions(sessions: Session[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Ignore storage failures and keep the in-memory session state usable.
  }
}
