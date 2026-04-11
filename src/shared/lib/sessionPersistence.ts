import type { Session } from '@/shared/types/schema';
import { deleteWorkspaceSession, saveWorkspaceSession } from '@/shared/api/commands';
import { sanitizeSession } from '@/shared/lib/sessionSanitizer';

export function persistSession(session: Session): void {
  if (!session.workspacePath) return;
  void saveWorkspaceSession(session.workspacePath, sanitizeSession(session)).catch((error) => {
    console.error('Failed to persist session', error);
  });
}

export function removePersistedSession(session: Session): void {
  if (!session.workspacePath) return;
  void deleteWorkspaceSession(session.workspacePath, session.id).catch((error) => {
    console.error('Failed to delete session', error);
  });
}

export function persistSessions(sessions: Iterable<Session>): void {
  for (const session of sessions) {
    persistSession(session);
  }
}
