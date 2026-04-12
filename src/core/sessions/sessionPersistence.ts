import type { Session } from '@/shared/types/schema';
import { deleteWorkspaceSession, saveWorkspaceSession } from '@/core/runtime/api/commands';
import { sanitizeSession } from '@/core/sessions/sessionSanitizer';

const BASE_PERSIST_DELAY_MS = 400;
const MAX_PERSIST_DELAY_MS = 30_000;

type PersistEntry =
  | { kind: 'save'; session: Session; version: number; attempt: number; running: boolean; timer?: number }
  | { kind: 'delete'; session: Session; version: number; attempt: number; running: boolean; timer?: number };

const persistQueue = new Map<string, PersistEntry>();

export function persistSession(session: Session): void {
  if (!session.workspacePath) return;
  enqueuePersist({
    kind: 'save',
    session,
    version: (persistQueue.get(session.id)?.version || 0) + 1,
    attempt: 0,
    running: false,
  });
}

export function removePersistedSession(session: Session): void {
  if (!session.workspacePath) return;
  enqueuePersist({
    kind: 'delete',
    session,
    version: (persistQueue.get(session.id)?.version || 0) + 1,
    attempt: 0,
    running: false,
  });
}

export function persistSessions(sessions: Iterable<Session>): void {
  for (const session of sessions) {
    persistSession(session);
  }
}

function enqueuePersist(entry: PersistEntry) {
  const existing = persistQueue.get(entry.session.id);
  if (existing?.timer !== undefined) {
    window.clearTimeout(existing.timer);
  }
  persistQueue.set(entry.session.id, entry);
  void runPersist(entry.session.id, entry.version);
}

async function runPersist(sessionId: string, version: number) {
  const current = persistQueue.get(sessionId);
  if (!current || current.version !== version || current.running) return;

  persistQueue.set(sessionId, { ...current, running: true });

  try {
    if (current.kind === 'save') {
      await saveWorkspaceSession(current.session.workspacePath!, sanitizeSession(current.session));
    } else {
      await deleteWorkspaceSession(current.session.workspacePath!, current.session.id);
    }

    const latest = persistQueue.get(sessionId);
    if (!latest) return;
    if (latest.version === version) {
      persistQueue.delete(sessionId);
      return;
    }

    void runPersist(sessionId, latest.version);
  } catch (error) {
    const latest = persistQueue.get(sessionId);
    if (!latest || latest.version !== version) return;

    const nextAttempt = latest.attempt + 1;
    const delayMs = Math.min(BASE_PERSIST_DELAY_MS * 2 ** (nextAttempt - 1), MAX_PERSIST_DELAY_MS);
    const timer = window.setTimeout(() => {
      const pending = persistQueue.get(sessionId);
      if (!pending || pending.version !== version) return;
      persistQueue.set(sessionId, { ...pending, timer: undefined, running: false });
      void runPersist(sessionId, version);
    }, delayMs);

    persistQueue.set(sessionId, {
      ...latest,
      attempt: nextAttempt,
      running: false,
      timer,
    });
    console.error('Failed to persist session, will retry', latest.session.id, nextAttempt, error);
  }
}
