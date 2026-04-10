import { Message, MessageSegment, ServerEventChunk, Session, StreamRuntime, ToolCall } from '@/shared/types/schema';
import { isUiOnlyTool } from '@/shared/lib/toolRegistry';

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

const withoutRetrySegments = (segments: MessageSegment[]) => segments.filter((segment) => segment.type !== 'retry');

const buildRuntimeFromChunk = (
  chunk: Extract<ServerEventChunk, { type: 'runtime_status' }>,
): StreamRuntime => ({
  state: chunk.state,
  reason: chunk.reason,
  message: chunk.message,
  attempt: chunk.attempt,
  retryAt: chunk.retryAt,
  retryInSeconds: chunk.retryInSeconds,
  updatedAt: Date.now(),
});

const phaseFromRuntimeState = (state: StreamRuntime['state']): Session['phase'] => {
  switch (state) {
    case 'starting':
      return 'starting';
    case 'streaming':
      return 'streaming';
    case 'backoff_waiting':
    case 'retrying':
      return 'retrying';
    case 'waiting_for_permission':
      return 'waiting_for_permission';
    case 'waiting_for_user':
      return 'waiting_for_ask';
    case 'interrupting':
      return 'interrupting';
    default:
      return 'idle';
  }
};

const appendText = (message: InternalMessage, text: string): InternalMessage => {
  const segments = [...(message.segments || [])];
  const content = (message.content || '') + text;

  if (message._liveTextIndex !== undefined) {
    const idx = message._liveTextIndex;
    if (idx < segments.length && segments[idx].type === 'text') {
      const seg = segments[idx];
      segments[idx] = { ...seg, content: seg.content + text };
      return { ...message, content, segments };
    }
  }

  const lastIdx = segments.length - 1;
  if (lastIdx >= 0 && segments[lastIdx].type === 'text') {
    const seg = segments[lastIdx];
    segments[lastIdx] = { ...seg, content: seg.content + text };
    return { ...message, content, segments, _liveTextIndex: lastIdx };
  }

  const newIdx = segments.length;
  segments.push({ type: 'text', content: text });
  return { ...message, content, segments, _liveTextIndex: newIdx };
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
    segments = withoutRetrySegments(segments);
    message = { ...message, segments };
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

    if (isUiOnlyTool(chunk.toolName)) {
      return { ...message, segments };
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
    const liveThinking = findLiveThinking(segments);
    if (liveThinking) {
      segments[liveThinking.index] = {
        ...liveThinking.segment,
        isLive: false,
      };
    }
    segments.push({
      type: 'ask',
      title: chunk.title,
      question: chunk.question,
      options: chunk.options,
      selectionType: chunk.selectionType,
      questions: chunk.questions,
      status: 'waiting',
      startTime: Date.now(),
    });
    return { ...message, segments, status: 'waiting_for_user', _liveTextIndex: undefined };
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
      startTime: Date.now(),
    });
    return { ...message, segments, status: 'waiting_for_permission', _liveTextIndex: undefined };
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
      updatedAt: Date.now(),
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
    segments = withoutRetrySegments(segments);
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

  if (chunk.type === 'done') {
    segments = withoutRetrySegments(segments);
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

  if (chunk.type === 'usage_update') {
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
    const parentSession = sessions.find((session) => session.id === chunk.parentSessionId);
    const newUserMessage: Message = {
      id: Date.now().toString() + '-u-sub',
      role: 'user',
      content: chunk.message,
      createdAt: Date.now(),
    };

    const newSession: Session = {
      id: chunk.subSessionId,
      title: chunk.title,
      updatedAt: Date.now(),
      workspacePath: parentSession?.workspacePath,
      phase: 'streaming',
      runtime: {
        state: 'streaming',
        message: '正在流式生成。',
        updatedAt: Date.now(),
      },
      messages: [newUserMessage],
      parentId: chunk.parentSessionId,
      queuedMessages: [],
    };

    const updatedSessions = sessions.map((session) => {
      if (session.id !== sessionId) return session;
      return updateMessage(session, messageId, (message) => {
        const updatedSegments = message.segments?.map((seg) =>
          seg.type === 'tool' && seg.tool.name === 'spawn_subagent' && seg.tool.status === 'running' && !seg.tool.subSessionId
            ? { ...seg, tool: { ...seg.tool, subSessionId: chunk.subSessionId } }
            : seg
        );
        return { ...message, segments: updatedSegments };
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
        return { ...s, phase: 'idle' as const };
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
        phase: phaseFromRuntimeState(runtime.state),
        error: runtime.state === 'failed' ? runtime.message || nextSession.error || 'Stream failed' : runtime.state === 'completed' || runtime.state === 'interrupted' ? null : nextSession.error,
      };
    } else if (chunk.type === 'ask_request') {
      nextSession = {
        ...nextSession,
        currentAsk: {
          toolId: chunk.toolId,
          title: chunk.title,
          question: chunk.question,
          options: chunk.options,
          selectionType: chunk.selectionType,
          questions: chunk.questions,
        },
        runtime: {
          state: 'waiting_for_user',
          reason: 'user_input',
          message: chunk.title || chunk.question,
          updatedAt: Date.now(),
        },
        phase: 'waiting_for_ask',
      };
    } else if (chunk.type === 'task_update') {
      nextSession = { ...nextSession, currentTasks: chunk.tasks };
    } else if (chunk.type === 'permission_request') {
      nextSession = {
        ...nextSession,
        permissionPending: true,
        phase: 'waiting_for_permission',
        runtime: {
          state: 'waiting_for_permission',
          reason: 'permission',
          message: `等待权限确认: ${chunk.toolName}`,
          updatedAt: Date.now(),
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
    } else if (chunk.type === 'cron_job_triggered') {
      nextSession = {
        ...nextSession,
        messages: [
          ...nextSession.messages,
          {
            id: `system-${Date.now()}-cron-trigger`,
            role: 'system',
            content: `定时任务已触发：${chunk.name} (${chunk.jobId})。`,
            createdAt: Date.now(),
          },
        ],
      };
    } else if (chunk.type === 'cron_job_completed') {
      nextSession = {
        ...nextSession,
        messages: [
          ...nextSession.messages,
          {
            id: `system-${Date.now()}-cron-complete`,
            role: 'system',
            content: `定时任务已完成：${chunk.name}，${chunk.success ? '执行成功' : '执行失败'}，耗时 ${Math.round(chunk.durationMs / 1000)}s。`,
            createdAt: Date.now(),
          },
        ],
      };
    } else if (chunk.type === 'done') {
      nextSession = {
        ...nextSession,
        phase: 'idle' as const,
        runtime: {
          state: 'completed',
          reason: 'completed',
          message: '会话已完成。',
          updatedAt: Date.now(),
        },
        error: null,
      };
    } else if (chunk.type === 'interrupted') {
      nextSession = {
        ...nextSession,
        phase: 'idle' as const,
        runtime: {
          state: 'interrupted',
          reason: 'interrupt',
          message: '会话已中断。',
          updatedAt: Date.now(),
        },
        error: null,
      };
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
