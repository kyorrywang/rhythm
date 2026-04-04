import { Message, MessageSegment, ServerEventChunk, Session, ToolCall } from '@/types/schema';

type InternalMessage = Message & {
  _liveTextIndex?: number;
};

export interface ChunkEffect {
  type: 'schedule_thinking_end';
  sessionId: string;
  messageId: string;
  delayMs: number;
  timeCostMs: number;
}

export interface ChunkReduceResult {
  sessions: Session[];
  activeSessionId?: string | null;
  effects: ChunkEffect[];
}

const updateMessage = (
  session: Session,
  messageId: string,
  updater: (message: InternalMessage) => InternalMessage,
): Session => ({
  ...session,
  messages: session.messages.map((message) =>
    message.id === messageId ? updater(message as InternalMessage) : message,
  ),
});

const findLiveThinking = (segments: MessageSegment[]): { index: number; segment: MessageSegment & { type: 'thinking' } } | null => {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.type === 'thinking' && seg.isLive) {
      return { index: i, segment: seg as MessageSegment & { type: 'thinking' } };
    }
  }
  return null;
};

const getOrCreateTextIndex = (message: InternalMessage): number => {
  if (message._liveTextIndex !== undefined) return message._liveTextIndex;

  const segments = [...(message.segments || [])];
  const lastIdx = segments.length;
  segments.push({ type: 'text', content: '' });
  return lastIdx;
};

const appendText = (message: InternalMessage, text: string): InternalMessage => {
  const segments = [...(message.segments || [])];
  const idx = getOrCreateTextIndex(message);

  if (idx < segments.length && segments[idx].type === 'text') {
    const seg = segments[idx];
    segments[idx] = { ...seg, content: seg.content + text };
  } else {
    segments.push({ type: 'text', content: text });
  }

  return { ...message, segments, _liveTextIndex: idx };
};

const applyTextDelta = (
  message: InternalMessage,
  chunk: Extract<ServerEventChunk, { type: 'text_delta' }>,
  sessionId: string,
  effects: ChunkEffect[],
): InternalMessage => {
  let segments = [...(message.segments || [])];
  let buffer = chunk.content;

  const liveThinking = findLiveThinking(segments);

  // Handle fake thinking tags (<think>...</think>)
  if (!liveThinking && buffer.includes('<think>')) {
    const parts = buffer.split('<think>');
    if (parts[0]) {
      const textIdx = segments.length;
      segments.push({ type: 'text', content: parts[0] });
      message = { ...message, segments, _liveTextIndex: textIdx };
    }
    buffer = parts.slice(1).join('<think>');
    segments = [...segments, { type: 'thinking', content: '', isLive: true, startTime: Date.now() }];
  }

  const newLiveThinking = findLiveThinking(segments);

  if (newLiveThinking && buffer.includes('</think>')) {
    const parts = buffer.split('</think>');
    segments[newLiveThinking.index] = {
      ...newLiveThinking.segment,
      content: newLiveThinking.segment.content + parts[0],
      isLive: false,
      timeCostMs: Date.now() - (newLiveThinking.segment.startTime || Date.now()),
    };
    buffer = parts.slice(1).join('</think>');
    effects.push({
      type: 'schedule_thinking_end',
      sessionId,
      messageId: message.id,
      delayMs: 0,
      timeCostMs: Date.now() - message.createdAt,
    });
  }

  const currentLiveThinking = findLiveThinking(segments);

  if (currentLiveThinking) {
    segments[currentLiveThinking.index] = {
      ...currentLiveThinking.segment,
      content: currentLiveThinking.segment.content + buffer,
    };
  } else {
    message = { ...message, segments };
    message = appendText(message, buffer);
    segments = message.segments || [];
  }

  return { ...message, segments };
};

const applyChunkToMessage = (
  message: InternalMessage,
  chunk: ServerEventChunk,
  sessionId: string,
  effects: ChunkEffect[],
): InternalMessage => {
  let segments = [...(message.segments || [])];

  if (chunk.type === 'thinking_delta') {
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        content: liveThinking.segment.content + chunk.content,
      };
    } else {
      segments.push({ type: 'thinking', content: chunk.content, isLive: true, startTime: Date.now() });
    }
    return { ...message, segments };
  }

  if (chunk.type === 'text_delta') {
    return applyTextDelta(message, chunk, sessionId, effects);
  }

  if (chunk.type === 'thinking_end') {
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
        timeCostMs: chunk.timeCostMs,
      };
    }
    return { ...message, segments };
  }

  if (chunk.type === 'tool_start') {
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
      };
    }

    const newTool: ToolCall = {
      id: chunk.toolId,
      name: chunk.toolName,
      arguments: chunk.args,
      status: 'running',
      logs: [],
      startTime: Date.now(),
    };

    segments.push({ type: 'tool', tool: newTool });
    return { ...message, segments };
  }

  if (chunk.type === 'tool_output') {
    return {
      ...message,
      segments: segments.map((seg) =>
        seg.type === 'tool' && seg.tool.id === chunk.toolId
          ? { ...seg, tool: { ...seg.tool, logs: [...(seg.tool.logs || []), chunk.logLine] } }
          : seg,
      ),
    };
  }

  if (chunk.type === 'tool_end') {
    return {
      ...message,
      segments: segments.map((seg) =>
        seg.type === 'tool' && seg.tool.id === chunk.toolId
          ? {
              ...seg,
              tool: {
                ...seg.tool,
                status: chunk.exitCode === 0 ? 'completed' : 'error',
                executionTime: Date.now() - (seg.tool.startTime || Date.now()),
              },
            }
          : seg,
      ),
    };
  }

  if (chunk.type === 'ask_request') {
    return { ...message, status: 'waiting_for_user' };
  }

  if (chunk.type === 'done') {
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
      };
    }
    return {
      ...message,
      segments,
      status: 'completed',
      totalTimeMs: Date.now() - message.createdAt,
    };
  }

  if (chunk.type === 'interrupted') {
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
      };
    }
    return {
      ...message,
      segments,
      status: 'completed',
      totalTimeMs: Date.now() - message.createdAt,
    };
  }

  return message;
};

export const reduceSessionChunk = (
  sessions: Session[],
  sessionId: string,
  messageId: string,
  chunk: ServerEventChunk,
): ChunkReduceResult => {
  const effects: ChunkEffect[] = [];

  if (chunk.type === 'subagent_start') {
    const parentSession = sessions.find(s => s.id === sessionId);
    const parentUserMessage = parentSession?.messages.filter(m => m.role === 'user').pop();

    const newSession: Session = {
      id: chunk.subSessionId,
      title: chunk.title,
      updatedAt: Date.now(),
      running: true,
      messages: parentUserMessage ? [parentUserMessage] : [],
      parentId: chunk.parentSessionId,
      queuedMessages: [],
    };

    const updatedSessions = sessions.map((session) => {
      if (session.id !== sessionId) return session;
      return updateMessage(session, messageId, (message) => {
        const updatedTools = message.toolCalls?.map((tool) =>
          tool.name === 'spawn_subagent' && tool.status === 'running' && !tool.subSessionId
            ? { ...tool, subSessionId: chunk.subSessionId }
            : tool
        );
        return { ...message, toolCalls: updatedTools };
      });
    });

    return {
      sessions: [...updatedSessions, newSession],
      effects,
    };
  }

  if (chunk.type === 'subagent_end') {
    const updatedSessions = sessions.map(s => {
      if (s.id === chunk.subSessionId) {
        return { ...s, running: false };
      }
      return s;
    });

    return {
      sessions: updatedSessions,
      effects,
    };
  }

  const nextSessions = sessions.map((session) => {
    if (session.id !== sessionId) return session;

    let nextSession: Session = session;

    if (chunk.type === 'ask_request') {
      nextSession = {
        ...nextSession,
        currentAsk: {
          toolId: chunk.toolId,
          question: chunk.question,
          options: chunk.options,
          selectionType: chunk.selectionType,
          questions: chunk.questions,
        },
      };
    } else if (chunk.type === 'task_update') {
      nextSession = { ...nextSession, currentTasks: chunk.tasks };
    } else if (chunk.type === 'done') {
      nextSession = { ...nextSession, running: false };
    }

    return updateMessage(nextSession, messageId, (message) =>
      applyChunkToMessage(message, chunk, sessionId, effects),
    );
  });

  return {
    sessions: nextSessions,
    effects,
  };
};
