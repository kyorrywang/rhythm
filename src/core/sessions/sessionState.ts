import type { AskRequest, Message, MessageSegment, Session, SessionQueueState, StreamRuntimeState, Task } from '@/shared/types/schema';

const TERMINAL_RUNTIME_STATES: StreamRuntimeState[] = ['idle', 'completed', 'failed', 'interrupted'];

export function getSessionRuntimeState(session: Session | undefined): StreamRuntimeState {
  if (!session) return 'idle';
  return session.runtime?.state || 'idle';
}

export function isSessionRunning(session: Session | undefined): boolean {
  return !TERMINAL_RUNTIME_STATES.includes(getSessionRuntimeState(session));
}

export function getSessionQueueState(session: Session | undefined): SessionQueueState {
  if (!session) return 'idle';
  return session.queueState || 'idle';
}

export function getCurrentAsk(session: Session | undefined): AskRequest | null {
  if (!session) return null;

  for (let i = session.messages.length - 1; i >= 0; i--) {
    const message = session.messages[i];
    const segments = message.segments || [];
    for (let j = segments.length - 1; j >= 0; j--) {
      const segment = segments[j];
      if (segment.type !== 'ask' || segment.status !== 'waiting') continue;
      if (!segment.toolId) continue;
      return {
        toolId: segment.toolId,
        title: segment.title,
        question: segment.question,
        options: segment.options,
        selectionType: segment.selectionType,
        questions: segment.questions,
      };
    }
  }
  return null;
}

export function getCurrentTasks(session: Session | undefined): Task[] {
  if (!session) return [];

  for (let i = session.messages.length - 1; i >= 0; i--) {
    const message = session.messages[i];
    const segments = message.segments || [];
    for (let j = segments.length - 1; j >= 0; j--) {
      const segment = segments[j];
      if (segment.type !== 'tasks') continue;
      return segment.tasks;
    }
  }
  return [];
}

export function hasPermissionPending(session: Session | undefined): boolean {
  if (!session) return false;
  if (session.runtime?.state === 'waiting_for_permission') return true;
  return session.messages.some((message) =>
    (message.segments || []).some((segment) => segment.type === 'permission' && segment.status === 'waiting'),
  );
}

export function getMessageTextContent(message: Message): string {
  if (message.role !== 'assistant') {
    return message.content || '';
  }

  const segmentText = (message.segments || [])
    .filter((segment): segment is Extract<MessageSegment, { type: 'text' }> => segment.type === 'text')
    .map((segment) => segment.content)
    .join('\n\n')
    .trim();

  return segmentText;
}
