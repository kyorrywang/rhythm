import type { Message, MessageSegment, ServerEventChunk, Session, StreamRuntime, ToolCall } from '@/shared/types/schema';
import { isUiOnlyTool } from '@/platform/tauri/adapters/toolRegistry';

type InternalMessage = Message & {
  _liveTextIndex?: number;
};

export interface ChunkEffect {
  type: 'schedule_thinking_end';
  sessionId: string;
  messageId: string;
  delayMs: number;
  endedAt: number;
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

const withoutRetrySegments = (segments: MessageSegment[]) => segments.filter((segment) => segment.type !== 'retry');
const getChunkTimestamp = (chunk: ServerEventChunk, fallback = Date.now()) => chunk.timestamp ?? fallback;

const getToolStartedAt = (tool: ToolCall, fallback: number) => tool.startedAt || fallback;
const getSegmentStartedAt = (segment: Extract<MessageSegment, { type: 'thinking' | 'ask' | 'permission' }>, fallback: number) =>
  segment.startedAt || fallback;

const finalizeTool = (
  tool: ToolCall,
  status: Extract<ToolCall['status'], 'completed' | 'error' | 'interrupted'>,
  endedAt: number,
  fallbackStartedAt: number,
): ToolCall => {
  const startedAt = getToolStartedAt(tool, fallbackStartedAt);
  return {
    ...tool,
    status,
    isPreparing: false,
    startedAt,
    endedAt,
  };
};

const finalizeMatchingToolInMessage = (
  message: Message,
  toolId: string,
  status: Extract<ToolCall['status'], 'completed' | 'error' | 'interrupted'>,
  endedAt: number,
): Message => ({
  ...message,
  segments: (message.segments || []).map((segment) => {
    if (segment.type !== 'tool' || segment.tool.id !== toolId) return segment;
    return {
      ...segment,
      tool: finalizeTool(
        {
          ...segment.tool,
          subSessionId: segment.tool.subSessionId,
        },
        status,
        endedAt,
        message.startedAt || message.createdAt,
      ),
    };
  }),
});

const finalizeToolSegments = (
  segments: MessageSegment[],
  status: Extract<ToolCall['status'], 'completed' | 'error' | 'interrupted'>,
  endedAt: number,
  matcher?: (tool: ToolCall) => boolean,
): MessageSegment[] =>
  segments.map((segment) => {
    if (segment.type !== 'tool') return segment;
    if (segment.tool.status !== 'running') return segment;
    if (matcher && !matcher(segment.tool)) return segment;

    return {
      ...segment,
      tool: finalizeTool(segment.tool, status, endedAt, endedAt),
    };
  });

const parseToolArguments = (rawArguments: string): unknown => {
  try {
    return JSON.parse(rawArguments);
  } catch {
    return {};
  }
};

const extractPartialJsonStringField = (raw: string, field: string): string => {
  const keyPattern = new RegExp(`"${field}"\\s*:\\s*"`, 'i');
  const keyMatch = keyPattern.exec(raw);
  if (!keyMatch) return '';

  let index = keyMatch.index + keyMatch[0].length;
  let escaped = false;
  let value = '';

  while (index < raw.length) {
    const char = raw[index];
    if (escaped) {
      value += char === 'n' ? '\n' : char === 't' ? '\t' : char;
      escaped = false;
      index += 1;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      index += 1;
      continue;
    }
    if (char === '"') {
      break;
    }
    value += char;
    index += 1;
  }

  return value;
};

const buildPartialToolArguments = (toolName: string, rawArguments: string): unknown => {
  const parsed = parseToolArguments(rawArguments);
  if (parsed && typeof parsed === 'object' && Object.keys(parsed as Record<string, unknown>).length > 0) {
    return parsed;
  }

  return {
    path: extractPartialJsonStringField(rawArguments, 'path') || extractPartialJsonStringField(rawArguments, 'file'),
    content: toolName === 'write' ? extractPartialJsonStringField(rawArguments, 'content') : '',
    search: toolName === 'edit' ? extractPartialJsonStringField(rawArguments, 'search') : '',
    replace: toolName === 'edit' ? extractPartialJsonStringField(rawArguments, 'replace') : '',
  };
};

const buildRuntimeFromChunk = (
  chunk: Extract<ServerEventChunk, { type: 'runtime_status' }>,
): StreamRuntime => ({
  state: chunk.state,
  reason: chunk.reason,
  message: chunk.message,
  attempt: chunk.attempt,
  retryAt: chunk.retryAt,
  retryInSeconds: chunk.retryInSeconds,
  updatedAt: getChunkTimestamp(chunk),
});

const appendText = (message: InternalMessage, text: string): InternalMessage => {
  const segments = [...(message.segments || [])];

  if (message._liveTextIndex !== undefined) {
    const idx = message._liveTextIndex;
    if (idx < segments.length && segments[idx].type === 'text') {
      const seg = segments[idx];
      segments[idx] = { ...seg, content: seg.content + text };
      return message.role === 'assistant'
        ? { ...message, segments }
        : { ...message, content: (message.content || '') + text, segments };
    }
  }

  const lastIdx = segments.length - 1;
  if (lastIdx >= 0 && segments[lastIdx].type === 'text') {
    const seg = segments[lastIdx];
    segments[lastIdx] = { ...seg, content: seg.content + text };
    return message.role === 'assistant'
      ? { ...message, segments, _liveTextIndex: lastIdx }
      : { ...message, content: (message.content || '') + text, segments, _liveTextIndex: lastIdx };
  }

  const newIdx = segments.length;
  segments.push({ type: 'text', content: text });
  return message.role === 'assistant'
    ? { ...message, segments, _liveTextIndex: newIdx }
    : { ...message, content: (message.content || '') + text, segments, _liveTextIndex: newIdx };
};

const applyTextDelta = (
  message: InternalMessage,
  chunk: Extract<ServerEventChunk, { type: 'text_delta' }>,
  sessionId: string,
  effects: ChunkEffect[],
): InternalMessage => {
  let segments = [...(message.segments || [])];
  let buffer = chunk.content;
  const eventTimestamp = getChunkTimestamp(chunk);

  const liveThinking = findLiveThinking(segments);

  if (!liveThinking && buffer.includes('<think>')) {
    const parts = buffer.split('<think>');
    if (parts[0]) {
      const textIdx = segments.length;
      segments.push({ type: 'text', content: parts[0] });
      message = { ...message, segments, _liveTextIndex: textIdx };
    }
    buffer = parts.slice(1).join('<think>');
    const startedAt = eventTimestamp;
    segments = [...segments, { type: 'thinking', content: '', isLive: true, startedAt }];
  }

  const newLiveThinking = findLiveThinking(segments);

  if (newLiveThinking && buffer.includes('</think>')) {
    const endedAt = eventTimestamp;
    const startedAt = getSegmentStartedAt(newLiveThinking.segment, endedAt);
    const parts = buffer.split('</think>');
    segments[newLiveThinking.index] = {
      ...newLiveThinking.segment,
      content: newLiveThinking.segment.content + parts[0],
      isLive: false,
      startedAt,
      endedAt,
    };
    buffer = parts.slice(1).join('</think>');
    effects.push({
      type: 'schedule_thinking_end',
      sessionId,
      messageId: message.id,
      delayMs: 0,
      endedAt,
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
  const eventTimestamp = getChunkTimestamp(chunk);

  if (chunk.type === 'thinking_delta') {
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        content: liveThinking.segment.content + chunk.content,
      };
    } else {
      segments.push({ type: 'thinking', content: chunk.content, isLive: true, startedAt: eventTimestamp });
    }
    return { ...message, segments };
  }

  if (chunk.type === 'text_delta') {
    segments = withoutRetrySegments(segments);
    message = { ...message, segments, startedAt: message.startedAt || message.createdAt };
    return applyTextDelta(message, chunk, sessionId, effects);
  }

  if (chunk.type === 'thinking_end') {
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      const endedAt = eventTimestamp;
      const startedAt = getSegmentStartedAt(
        liveThinking.segment,
        message.startedAt || message.createdAt || endedAt,
      );
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
        startedAt,
        endedAt,
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

    if (isUiOnlyTool(chunk.toolName)) {
      return { ...message, segments };
    }

    const existingToolIndex = segments.findIndex(
      (seg) => seg.type === 'tool' && seg.tool.id === chunk.toolId,
    );

    const newTool: ToolCall = {
      id: chunk.toolId,
      name: chunk.toolName,
      arguments: chunk.args,
      rawArguments: JSON.stringify(chunk.args),
      isPreparing: false,
      status: 'running',
      logs: existingToolIndex >= 0 && segments[existingToolIndex].type === 'tool'
        ? (segments[existingToolIndex].tool.logs || [])
        : [],
      startedAt: existingToolIndex >= 0 && segments[existingToolIndex].type === 'tool'
        ? getToolStartedAt(segments[existingToolIndex].tool, eventTimestamp)
        : eventTimestamp,
      endedAt: undefined,
    };

    if (existingToolIndex >= 0) {
      segments[existingToolIndex] = { type: 'tool', tool: newTool };
    } else {
      segments.push({ type: 'tool', tool: newTool });
    }

    return { ...message, segments, _liveTextIndex: undefined };
  }

  if (chunk.type === 'tool_call_delta') {
    if (isUiOnlyTool(chunk.toolName)) {
      return { ...message, segments };
    }

    const existingToolIndex = segments.findIndex(
      (seg) => seg.type === 'tool' && seg.tool.id === chunk.toolId,
    );
    const parsedArguments = buildPartialToolArguments(chunk.toolName, chunk.argumentsText);

    if (existingToolIndex >= 0) {
      const existingSegment = segments[existingToolIndex];
      if (existingSegment.type === 'tool') {
        segments[existingToolIndex] = {
          type: 'tool',
          tool: {
            ...existingSegment.tool,
            name: chunk.toolName,
            arguments: parsedArguments,
            rawArguments: chunk.argumentsText,
            isPreparing: true,
            status: 'running',
          },
        };
      }
      return { ...message, segments, _liveTextIndex: undefined };
    }

    segments.push({
      type: 'tool',
      tool: {
        id: chunk.toolId,
        name: chunk.toolName,
        arguments: parsedArguments,
        rawArguments: chunk.argumentsText,
        isPreparing: true,
        status: 'running',
        logs: [],
        startedAt: eventTimestamp,
      },
    });
    return { ...message, segments, _liveTextIndex: undefined };
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

  if (chunk.type === 'tool_result') {
    return {
      ...message,
      segments: segments.map((seg) =>
        seg.type === 'tool' && seg.tool.id === chunk.toolId
          ? {
              ...seg,
              tool: {
                ...seg.tool,
                result: chunk.result,
                isPreparing: false,
                logs: chunk.isError && !(seg.tool.logs || []).length
                  ? [chunk.result]
                  : seg.tool.logs,
              },
            }
          : seg,
      ),
    };
  }

  if (chunk.type === 'tool_end') {
    const endedAt = eventTimestamp;
    return {
      ...message,
      segments: segments.map((seg) =>
        seg.type === 'tool' && seg.tool.id === chunk.toolId
          ? {
              ...seg,
              tool: finalizeTool(
                seg.tool,
                chunk.exitCode === 0 ? 'completed' : 'error',
                endedAt,
                message.startedAt || message.createdAt,
              ),
            }
          : seg,
      ),
    };
  }

  if (chunk.type === 'ask_request') {
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
      };
    }
    segments.push({
      type: 'ask',
      toolId: chunk.toolId,
      title: chunk.title,
      question: chunk.question,
      options: chunk.options,
      selectionType: chunk.selectionType,
      questions: chunk.questions,
      status: 'waiting',
      startedAt: eventTimestamp,
    });
    return { ...message, segments, status: 'waiting_for_user', startedAt: message.startedAt || message.createdAt, _liveTextIndex: undefined };
  }

  if (chunk.type === 'permission_request') {
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
      };
    }

    segments.push({
      type: 'permission',
      request: {
        toolId: chunk.toolId,
        toolName: chunk.toolName,
        reason: chunk.reason,
      },
      status: 'waiting',
      startedAt: eventTimestamp,
    });
    return { ...message, segments, status: 'waiting_for_permission', startedAt: message.startedAt || message.createdAt, _liveTextIndex: undefined };
  }

  if (chunk.type === 'runtime_status' && (chunk.state === 'backoff_waiting' || chunk.state === 'retrying')) {
    const nextRetrySegment: MessageSegment = {
      type: 'retry',
      state: chunk.state,
      reason: chunk.reason,
      message: chunk.message || '',
      attempt: chunk.attempt || 0,
      retryAt: chunk.retryAt,
      retryInSeconds: chunk.retryInSeconds,
      updatedAt: eventTimestamp,
    };
    const retryIndex = segments.findIndex((seg) => seg.type === 'retry');
    if (retryIndex >= 0) {
      segments[retryIndex] = nextRetrySegment;
    } else {
      segments.push(nextRetrySegment);
    }
    return { ...message, segments };
  }

  if (chunk.type === 'interrupted') {
    const endedAt = eventTimestamp;
    segments = finalizeToolSegments(withoutRetrySegments(segments), 'interrupted', endedAt);
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      const startedAt = getSegmentStartedAt(liveThinking.segment, endedAt);
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
        startedAt,
        endedAt,
      };
    }
    return {
      ...message,
      segments,
      status: 'completed',
      startedAt: message.startedAt || message.createdAt,
      endedAt,
    };
  }

  if (chunk.type === 'failed') {
    const endedAt = eventTimestamp;
    segments = finalizeToolSegments(withoutRetrySegments(segments), 'error', endedAt);
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      const startedAt = getSegmentStartedAt(liveThinking.segment, endedAt);
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
        startedAt,
        endedAt,
      };
    }
    return {
      ...message,
      segments,
      status: 'completed',
      startedAt: message.startedAt || message.createdAt,
      endedAt,
    };
  }

  if (chunk.type === 'done') {
    const endedAt = eventTimestamp;
    segments = finalizeToolSegments(withoutRetrySegments(segments), 'completed', endedAt);
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      const startedAt = getSegmentStartedAt(liveThinking.segment, endedAt);
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
        startedAt,
        endedAt,
      };
    }
    return {
      ...message,
      segments,
      status: 'completed',
      startedAt: message.startedAt || message.createdAt,
      endedAt,
    };
  }

  if (chunk.type === 'usage_update') {
    return message;
  }

  if (chunk.type === 'heartbeat') {
    return message;
  }

  if (chunk.type === 'task_update') {
    return message;
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
    const startedAt = chunk.startedAt;
    const parentSession = sessions.find((session) => session.id === chunk.parentSessionId);
    const existingSubSession = sessions.find((session) => session.id === chunk.subSessionId);
    const newUserMessage: Message = {
      id: `${startedAt}-u-sub`,
      role: 'user',
      content: chunk.message,
      createdAt: startedAt,
      startedAt,
    };

    const updatedSessions: Session[] = sessions.map((session): Session => {
      if (session.id === chunk.subSessionId) {
        return {
          ...session,
          title: chunk.title,
          updatedAt: startedAt,
          workspacePath: session.workspacePath || parentSession?.workspacePath,
          runtime: {
            state: 'streaming',
            message: '正在流式生成。',
            updatedAt: startedAt,
          },
          parentId: chunk.parentSessionId,
          queuedMessages: session.queuedMessages || [],
          messages: session.messages.length > 0 ? session.messages : [newUserMessage],
        };
      }
      if (session.id !== chunk.parentSessionId) return session;
      return updateMessage(session, messageId, (message) => {
        const updatedSegments = message.segments?.map((seg) => {
          if (seg.type !== 'tool' || seg.tool.id !== chunk.parentToolCallId) return seg;
          return {
            ...seg,
            tool: {
              ...seg.tool,
              subSessionId: chunk.subSessionId,
              startedAt: seg.tool.startedAt || chunk.startedAt,
            },
          };
        });
        return { ...message, segments: updatedSegments };
      });
    });
    const nextSubSession: Session = {
      id: chunk.subSessionId,
      title: chunk.title,
      updatedAt: startedAt,
      workspacePath: parentSession?.workspacePath,
      runtime: {
        state: 'streaming',
        message: '正在流式生成。',
        updatedAt: startedAt,
      },
      messages: [newUserMessage],
      parentId: chunk.parentSessionId,
      queuedMessages: [],
    };

    return {
      sessions: existingSubSession
        ? updatedSessions
        : [
            ...updatedSessions,
            nextSubSession,
          ],
      effects,
    };
  }

  if (chunk.type === 'subagent_end') {
    const endedAt = getChunkTimestamp(chunk);
    const updatedSessions: Session[] = sessions.map((s): Session => {
      if (s.id === chunk.subSessionId) {
        const finalizedMessages = s.messages.map((message) => ({
          ...message,
          segments: finalizeToolSegments(message.segments || [], chunk.isError ? 'error' : 'completed', endedAt),
          status: message.status === 'running' ? 'completed' : message.status,
          endedAt: message.endedAt || endedAt,
        }));
        return {
          ...s,
          runtime: {
            state: chunk.isError ? 'failed' : 'completed',
            reason: chunk.isError ? 'error' : 'completed',
            message: chunk.result,
            updatedAt: endedAt,
          },
          error: chunk.isError ? chunk.result : null,
          subagentResult: {
            result: chunk.result,
            isError: chunk.isError,
            endedAt,
          },
          messages: [
            ...finalizedMessages,
            {
              id: `system-${endedAt}-subagent-end`,
              role: 'system' as const,
              content: chunk.isError
                ? `Dynamic agent failed: ${chunk.result}`
                : `Dynamic agent completed: ${chunk.result}`,
              createdAt: endedAt,
            },
          ],
          updatedAt: endedAt,
        };
      }
      if (s.id === chunk.parentSessionId) {
        const finalizedMessages = s.messages.map((message) =>
          finalizeMatchingToolInMessage(
            message,
            chunk.parentToolCallId,
            chunk.isError ? 'error' : 'completed',
            endedAt,
          ),
        );
        return {
          ...s,
          messages: [
            ...finalizedMessages,
            {
              id: `system-${endedAt}-child-result-${chunk.subSessionId}`,
              role: 'system' as const,
              content: chunk.isError
                ? `Child session ${chunk.subSessionId} failed: ${chunk.result}`
                : `Child session ${chunk.subSessionId} completed: ${chunk.result}`,
              createdAt: endedAt,
            },
          ],
          updatedAt: endedAt,
        };
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

    if (chunk.type === 'runtime_status') {
      const runtime = buildRuntimeFromChunk(chunk);
      nextSession = {
        ...nextSession,
        runtime,
        error: runtime.state === 'failed' ? runtime.message || nextSession.error || 'Stream failed' : runtime.state === 'completed' || runtime.state === 'interrupted' ? null : nextSession.error,
      };
      if (runtime.state === 'interrupting') {
        const endedAt = runtime.updatedAt;
        nextSession = {
          ...nextSession,
          messages: nextSession.messages.map((message) => ({
            ...message,
            segments: finalizeToolSegments(message.segments || [], 'interrupted', endedAt),
          })),
        };
      }
    } else if (chunk.type === 'ask_request') {
      nextSession = {
        ...nextSession,
        runtime: {
          state: 'waiting_for_user',
          reason: 'user_input',
          message: chunk.title || chunk.question,
          updatedAt: getChunkTimestamp(chunk),
        },
      };
    } else if (chunk.type === 'task_update') {
      nextSession = { ...nextSession };
    } else if (chunk.type === 'permission_request') {
      nextSession = {
        ...nextSession,
        runtime: {
          state: 'waiting_for_permission',
          reason: 'permission',
          message: `等待权限确认: ${chunk.toolName}`,
          updatedAt: getChunkTimestamp(chunk),
        },
      };
    } else if (chunk.type === 'usage_update') {
      nextSession = {
        ...nextSession,
        usage: {
          inputTokens: chunk.inputTokens,
          outputTokens: chunk.outputTokens,
        },
        tokenCount: chunk.inputTokens + chunk.outputTokens,
      };
    } else if (chunk.type === 'heartbeat') {
      nextSession = {
        ...nextSession,
      };
    } else if (chunk.type === 'cron_job_triggered') {
      nextSession = {
        ...nextSession,
        messages: [
            ...nextSession.messages,
            {
            id: `system-${getChunkTimestamp(chunk)}-cron-trigger`,
            role: 'system',
            content: `定时任务已触发：${chunk.name} (${chunk.jobId})。`,
            createdAt: getChunkTimestamp(chunk),
          },
        ],
      };
    } else if (chunk.type === 'cron_job_completed') {
      nextSession = {
        ...nextSession,
        messages: [
            ...nextSession.messages,
            {
            id: `system-${getChunkTimestamp(chunk)}-cron-complete`,
            role: 'system',
            content: `定时任务已完成：${chunk.name}，${chunk.success ? '执行成功' : '执行失败'}，耗时 ${Math.round(chunk.durationMs / 1000)}s。`,
            createdAt: getChunkTimestamp(chunk),
          },
        ],
      };
    } else if (chunk.type === 'done') {
      nextSession = {
        ...nextSession,
        queueState: 'idle',
        runtime: {
          state: 'completed',
          reason: 'completed',
          message: '会话已完成。',
          updatedAt: getChunkTimestamp(chunk),
        },
        error: null,
      };
    } else if (chunk.type === 'failed') {
      nextSession = {
        ...nextSession,
        queueState: 'idle',
        runtime: {
          state: 'failed',
          reason: 'error',
          message: nextSession.error || '会话失败。',
          updatedAt: getChunkTimestamp(chunk),
        },
      };
    } else if (chunk.type === 'interrupted') {
      nextSession = {
        ...nextSession,
        queueState: 'idle',
        runtime: {
          state: 'interrupted',
          reason: 'interrupt',
          message: '会话已中断。',
          updatedAt: getChunkTimestamp(chunk),
        },
        error: null,
      };
    }

    return updateMessage(nextSession, messageId, (message) => {
      const updatedMessage = applyChunkToMessage(message, chunk, sessionId, effects);
      if (chunk.type !== 'task_update') return updatedMessage;

      const segments = [...(updatedMessage.segments || [])];
      const lastTasksIndex = segments.findIndex((segment) => segment.type === 'tasks');
      const taskSegment: Extract<MessageSegment, { type: 'tasks' }> = {
        type: 'tasks',
        tasks: chunk.tasks,
        startedAt: updatedMessage.startedAt || updatedMessage.createdAt,
        endedAt: chunk.tasks.every((task) => task.status === 'completed' || task.status === 'error')
          ? getChunkTimestamp(chunk)
          : undefined,
      };

      if (lastTasksIndex >= 0) {
        segments[lastTasksIndex] = taskSegment;
      } else {
        segments.push(taskSegment);
      }

      return {
        ...updatedMessage,
        segments,
      };
    });
  });

  return {
    sessions: nextSessions,
    effects,
  };
};

