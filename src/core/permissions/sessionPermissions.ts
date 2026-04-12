import type { Session } from '@/shared/types/schema';

export function resolvePermissionGrantSessionId(
  sessions: Map<string, Session>,
  sessionId: string,
): string {
  let currentSessionId = sessionId;
  const visited = new Set<string>();

  while (currentSessionId && !visited.has(currentSessionId)) {
    visited.add(currentSessionId);
    const session = sessions.get(currentSessionId);
    if (!session?.parentId) {
      return currentSessionId;
    }
    currentSessionId = session.parentId;
  }

  return sessionId;
}

export function hasSessionPermissionGrant(
  sessions: Map<string, Session>,
  sessionId: string,
  toolName: string,
): boolean {
  let currentSessionId: string | undefined = sessionId;
  const visited = new Set<string>();

  while (currentSessionId && !visited.has(currentSessionId)) {
    visited.add(currentSessionId);
    const session = sessions.get(currentSessionId);
    if (!session) return false;
    if ((session.permissionGrants ?? []).includes(toolName)) {
      return true;
    }
    currentSessionId = session.parentId;
  }

  return false;
}
