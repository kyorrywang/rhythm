import type { Session } from '@/shared/types/schema';

export function collectSessionTreeIds(
  sessions: Map<string, Session>,
  sessionId: string,
): string[] {
  const ids = new Set<string>();
  const stack: string[] = [];

  let currentId: string | undefined = sessionId;
  while (currentId && !ids.has(currentId)) {
    ids.add(currentId);
    stack.push(currentId);
    currentId = sessions.get(currentId)?.parentId;
  }

  let added = true;
  while (added) {
    added = false;
    for (const session of sessions.values()) {
      if (!session.parentId || ids.has(session.id) || !ids.has(session.parentId)) {
        continue;
      }
      ids.add(session.id);
      stack.push(session.id);
      added = true;
    }
  }

  return stack;
}
