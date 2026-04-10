import { describe, expect, it } from 'vitest';
import { reduceSessionChunk } from '../shared/state/sessionChunkReducer';
import { createMessageSlice } from '../shared/state/slices/messageSlice';
import type { Message, Session } from '../shared/types/schema';

function buildSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    title: id,
    updatedAt: 1,
    messages: [],
    queuedMessages: [],
    phase: 'idle',
    runtime: {
      state: 'idle',
      updatedAt: 1,
    },
    ...overrides,
  };
}

describe('coordinate stage 0 session flow', () => {
  it('persists child completion result and echoes it to the parent session', () => {
    const parentMessage: Message = {
      id: 'parent-assistant',
      role: 'assistant',
      content: '',
      createdAt: 1,
      segments: [],
    };
    const sessions = [
      buildSession('parent', { messages: [parentMessage] }),
      buildSession('child', {
        parentId: 'parent',
        phase: 'streaming',
        runtime: {
          state: 'streaming',
          updatedAt: 1,
        },
        messages: [{
          id: 'child-assistant',
          role: 'assistant',
          content: 'working',
          createdAt: 1,
        }],
      }),
    ];

    const reduced = reduceSessionChunk(sessions, 'child', 'child-assistant', {
      type: 'subagent_end',
      sessionId: 'parent',
      subSessionId: 'child',
      result: 'done',
      isError: false,
    });

    const nextChild = reduced.sessions.find((session) => session.id === 'child');
    const nextParent = reduced.sessions.find((session) => session.id === 'parent');

    expect(nextChild?.subagentResult).toMatchObject({
      result: 'done',
      isError: false,
    });
    expect(nextChild?.runtime?.state).toBe('completed');
    expect(nextChild?.messages.at(-1)?.content).toContain('Dynamic agent completed: done');
    expect(nextParent?.messages.at(-1)?.content).toContain('Child session child completed: done');
  });

  it('keeps parent queued input on the parent when a child session starts', () => {
    let state = {
      sessions: new Map<string, Session>([
        ['parent', buildSession('parent', {
          queuedMessages: [{
            id: 'q1',
            priority: 'normal',
            createdAt: 1,
            message: {
              id: 'queued-msg',
              role: 'user',
              content: 'follow-up for parent',
              createdAt: 1,
            },
          }],
        })],
        ['child', buildSession('child')],
      ]),
      messages: new Map(),
      queuedMessages: new Map(),
      currentAsk: new Map(),
      currentTasks: new Map(),
    };

    const slice = createMessageSlice(
      (partial) => {
        const next = typeof partial === 'function' ? partial(state) : partial;
        state = { ...state, ...next };
      },
      () => state,
    );

    const nextSessions = slice.migrateQueueToChild('parent', 'child', state.sessions);
    expect(nextSessions.get('parent')?.queuedMessages).toHaveLength(1);
    expect(nextSessions.get('child')?.queuedMessages).toHaveLength(0);
  });
});
