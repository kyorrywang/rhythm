import { describe, expect, it } from 'vitest';
import { reduceSessionChunk } from '../core/sessions/sessionChunkReducer';
import { normalizeSessions } from '../core/runtime/api/commands';
import { createMessageSlice } from '../core/sessions/slices/messageSlice';
import type { Message, Session } from '../shared/types/schema';

function buildSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    title: id,
    updatedAt: 1,
    messages: [],
    queuedMessages: [],
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
      createdAt: 1,
      segments: [],
    };
    const sessions = [
      buildSession('parent', { messages: [parentMessage] }),
      buildSession('child', {
        parentId: 'parent',
        runtime: {
          state: 'streaming',
          updatedAt: 1,
        },
        messages: [{
          id: 'child-assistant',
          role: 'assistant',
          createdAt: 1,
          segments: [{ type: 'text', content: 'working' }],
        }],
      }),
    ];

    const reduced = reduceSessionChunk(sessions, 'child', 'child-assistant', {
      type: 'subagent_end',
      sessionId: 'child',
      timestamp: 12,
      parentSessionId: 'parent',
      parentToolCallId: 'tool-parent',
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
    expect(nextChild?.messages[nextChild.messages.length - 1]?.content).toContain('Dynamic agent completed: done');
    expect(nextParent?.messages[nextParent.messages.length - 1]?.content).toContain('Child session child completed: done');
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

  it('binds concurrent subagents to the matching parent tool call ids', () => {
    const parentMessage: Message = {
      id: 'parent-assistant',
      role: 'assistant',
      createdAt: 1,
      startedAt: 1,
      segments: [
        { type: 'tool', tool: { id: 'tool-1', name: 'spawn_subagent', arguments: {}, status: 'running', startedAt: 10 } },
        { type: 'tool', tool: { id: 'tool-2', name: 'spawn_subagent', arguments: {}, status: 'running', startedAt: 20 } },
        { type: 'tool', tool: { id: 'tool-3', name: 'spawn_subagent', arguments: {}, status: 'running', startedAt: 30 } },
      ],
    };

    let sessions = [buildSession('parent', { messages: [parentMessage] })];

    sessions = reduceSessionChunk(sessions, 'parent', 'parent-assistant', {
      type: 'subagent_start',
      sessionId: 'parent',
      parentSessionId: 'parent',
      parentToolCallId: 'tool-1',
      subSessionId: 'child-1',
      title: '人物设定',
      message: 'child-1 job',
      startedAt: 10,
    }).sessions;

    sessions = reduceSessionChunk(sessions, 'parent', 'parent-assistant', {
      type: 'subagent_start',
      sessionId: 'parent',
      parentSessionId: 'parent',
      parentToolCallId: 'tool-2',
      subSessionId: 'child-2',
      title: '世界观设定',
      message: 'child-2 job',
      startedAt: 20,
    }).sessions;

    sessions = reduceSessionChunk(sessions, 'parent', 'parent-assistant', {
      type: 'subagent_start',
      sessionId: 'parent',
      parentSessionId: 'parent',
      parentToolCallId: 'tool-3',
      subSessionId: 'child-3',
      title: '主线冲突',
      message: 'child-3 job',
      startedAt: 30,
    }).sessions;

    sessions = reduceSessionChunk(sessions, 'child-3', 'child-3-assistant', {
      type: 'subagent_end',
      sessionId: 'child-3',
      timestamp: 90,
      parentSessionId: 'parent',
      parentToolCallId: 'tool-3',
      subSessionId: 'child-3',
      result: 'done-3',
      isError: false,
    }).sessions;

    const parent = sessions.find((session) => session.id === 'parent');
    const toolSegments = parent?.messages[0]?.segments?.filter((segment) => segment.type === 'tool') || [];
    const tool1 = toolSegments[0]?.type === 'tool' ? toolSegments[0].tool : undefined;
    const tool2 = toolSegments[1]?.type === 'tool' ? toolSegments[1].tool : undefined;
    const tool3 = toolSegments[2]?.type === 'tool' ? toolSegments[2].tool : undefined;

    expect(tool1?.subSessionId).toBe('child-1');
    expect(tool1?.status).toBe('running');
    expect(tool2?.subSessionId).toBe('child-2');
    expect(tool2?.status).toBe('running');
    expect(tool3?.subSessionId).toBe('child-3');
    expect(tool3?.status).toBe('completed');
    expect((tool3?.endedAt ?? 0) - (tool3?.startedAt ?? 0)).toBe(60);
  });

  it('does not duplicate sub sessions when subagent_start is replayed', () => {
    const parentMessage: Message = {
      id: 'parent-assistant',
      role: 'assistant',
      createdAt: 1,
      startedAt: 1,
      segments: [
        { type: 'tool', tool: { id: 'tool-1', name: 'spawn_subagent', arguments: {}, status: 'running', startedAt: 10 } },
      ],
    };

    let sessions = [buildSession('parent', { messages: [parentMessage] })];

    const startChunk = {
      type: 'subagent_start' as const,
      sessionId: 'parent',
      parentSessionId: 'parent',
      parentToolCallId: 'tool-1',
      subSessionId: 'child-1',
      title: '人物设定',
      message: 'child-1 job',
      startedAt: 10,
    };

    sessions = reduceSessionChunk(sessions, 'parent', 'parent-assistant', startChunk).sessions;
    sessions = reduceSessionChunk(sessions, 'parent', 'parent-assistant', startChunk).sessions;

    expect(sessions.filter((session) => session.id === 'child-1')).toHaveLength(1);
    expect(sessions.find((session) => session.id === 'child-1')?.messages[0]?.createdAt).toBe(10);
  });

  it('preserves completed subagent duration after hydration', () => {
    const sessions = [
      buildSession('parent', {
        updatedAt: 100,
        messages: [{
          id: 'parent-assistant',
          role: 'assistant',
          createdAt: 1,
          startedAt: 1,
          segments: [
            {
              type: 'tool',
              tool: {
                id: 'tool-3',
                name: 'spawn_subagent',
                arguments: {},
                status: 'running',
                startedAt: 30,
                subSessionId: 'child-3',
              },
            },
          ],
        }],
      }),
      buildSession('child-3', {
        updatedAt: 90,
        parentId: 'parent',
        runtime: {
          state: 'completed',
          updatedAt: 90,
        },
        subagentResult: {
          result: 'done-3',
          isError: false,
          endedAt: 90,
        },
      }),
    ];

    const hydrated = normalizeSessions(sessions);

    const parent = hydrated.find((session) => session.id === 'parent');
    const toolSegment = parent?.messages[0]?.segments?.[0];
    const tool = toolSegment?.type === 'tool' ? toolSegment.tool : undefined;

    expect(tool?.status).toBe('completed');
    expect(tool?.subSessionId).toBe('child-3');
    expect((tool?.endedAt ?? 0) - (tool?.startedAt ?? 0)).toBe(60);
    expect(tool?.endedAt).toBe(90);
  });
});
