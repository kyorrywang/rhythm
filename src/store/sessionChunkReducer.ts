import { Message, ServerEventChunk, Session, ToolCall } from '@/types/schema';

type InternalMessage = Message & {
  isInsideThink?: boolean;
  hasFakeThinking?: boolean;
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

const applyTextDelta = (
  message: InternalMessage,
  chunk: Extract<ServerEventChunk, { type: 'text_delta' }>,
  sessionId: string,
  effects: ChunkEffect[],
): InternalMessage => {
  let newContent = message.content || '';
  let newThinking = message.thinkingContent || '';
  let isInsideThink = message.isInsideThink || false;
  let hasFakeThinking = message.hasFakeThinking || false;
  let buffer = chunk.content;

  if (!isInsideThink && buffer.includes('<think>')) {
    isInsideThink = true;
    const parts = buffer.split('<think>');
    newContent += parts[0];
    buffer = parts[1] ?? '';
    hasFakeThinking = true;
  }

  if (isInsideThink && buffer.includes('</think>')) {
    isInsideThink = false;
    const parts = buffer.split('</think>');
    newThinking += parts[0];
    buffer = parts[1] ?? '';
    effects.push({
      type: 'schedule_thinking_end',
      sessionId,
      messageId: message.id,
      delayMs: 0,
      timeCostMs: Date.now() - message.createdAt,
    });
  }

  if (isInsideThink) {
    newThinking += buffer;
  } else {
    newContent += buffer;
  }

  return {
    ...message,
    content: newContent,
    thinkingContent: newThinking,
    hadThinking: message.hadThinking || hasFakeThinking,
    isInsideThink,
    hasFakeThinking,
  };
};

const applyChunkToMessage = (
  message: InternalMessage,
  chunk: ServerEventChunk,
  sessionId: string,
  effects: ChunkEffect[],
): InternalMessage => {
  if (chunk.type === 'thinking_delta') {
    return {
      ...message,
      thinkingContent: (message.thinkingContent || '') + chunk.content,
      hadThinking: true,
      thinkingStartTime: message.thinkingStartTime || Date.now(),
    };
  }

  if (chunk.type === 'text_delta') {
    return applyTextDelta(message, chunk, sessionId, effects);
  }

  if (chunk.type === 'thinking_end') {
    return {
      ...message,
      isThinking: false,
      thinkingTimeCostMs: chunk.timeCostMs,
      hadThinking: message.hadThinking || chunk.timeCostMs > 0,
    };
  }

  if (chunk.type === 'tool_start') {
    const newTool: ToolCall = {
      id: chunk.toolId,
      name: chunk.toolName,
      arguments: chunk.args,
      status: 'running',
      logs: [],
      startTime: Date.now(),
    };
    return { ...message, toolCalls: [...(message.toolCalls || []), newTool] };
  }

  if (chunk.type === 'tool_output') {
    return {
      ...message,
      toolCalls: message.toolCalls?.map((tool) =>
        tool.id === chunk.toolId ? { ...tool, logs: [...(tool.logs || []), chunk.logLine] } : tool,
      ),
    };
  }

  if (chunk.type === 'tool_end') {
    return {
      ...message,
      toolCalls: message.toolCalls?.map((tool) =>
        tool.id === chunk.toolId
          ? {
              ...tool,
              status: chunk.exitCode === 0 ? 'completed' : 'error',
              executionTime: Date.now() - (tool.startTime || Date.now()),
            }
          : tool,
      ),
    };
  }

  if (chunk.type === 'ask_request') {
    return { ...message, status: 'waiting_for_user' };
  }

  if (chunk.type === 'done') {
    const updates: Partial<InternalMessage> = { status: 'completed' };
    if (message.isInsideThink) {
      updates.isInsideThink = false;
      updates.thinkingTimeCostMs = Date.now() - message.createdAt;
    }
    return { ...message, ...updates };
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
    const newSession: Session = {
      id: chunk.subSessionId,
      title: chunk.title,
      updatedAt: Date.now(),
      running: true,
      messages: [],
      parentId: chunk.parentSessionId,
      queuedMessages: [],
    };

    return {
      sessions: [...sessions, newSession],
      activeSessionId: chunk.subSessionId,
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
