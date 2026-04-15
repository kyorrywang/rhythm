import type {
  Message,
  MessageSegment,
  Session,
  StreamRuntime,
  ToolCall,
} from '@/shared/types/schema';

function sanitizeToolCall(tool: ToolCall): ToolCall {
  return {
    id: tool.id,
    name: tool.name,
    arguments: tool.arguments,
    rawArguments: tool.rawArguments,
    isPreparing: tool.isPreparing,
    result: tool.result,
    status: tool.status,
    logs: tool.logs ? [...tool.logs] : undefined,
    startedAt: tool.startedAt,
    endedAt: tool.endedAt,
    subSessionId: tool.subSessionId,
  };
}

function sanitizeMessageSegment(segment: MessageSegment): MessageSegment {
  switch (segment.type) {
    case 'thinking':
      return {
        type: 'thinking',
        content: segment.content,
        isLive: segment.isLive,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
      };
    case 'tool':
      return {
        type: 'tool',
        tool: sanitizeToolCall(segment.tool),
      };
    case 'ask':
      return {
        type: 'ask',
        toolId: segment.toolId,
        title: segment.title,
        question: segment.question,
        options: [...segment.options],
        selectionType: segment.selectionType,
        questions: segment.questions?.map((question) => ({
          question: question.question,
          options: [...question.options],
          selectionType: question.selectionType,
        })),
        status: segment.status,
        answer: segment.answer
          ? {
              selected: [...segment.answer.selected],
              text: segment.answer.text,
            }
          : undefined,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
      };
    case 'tasks':
      return {
        type: 'tasks',
        tasks: segment.tasks.map((task) => ({
          id: task.id,
          text: task.text,
          status: task.status,
        })),
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
      };
    case 'retry':
      return {
        type: 'retry',
        state: segment.state,
        reason: segment.reason,
        message: segment.message,
        attempt: segment.attempt,
        retryAt: segment.retryAt,
        retryInSeconds: segment.retryInSeconds,
        updatedAt: segment.updatedAt,
      };
    case 'text':
      return {
        type: 'text',
        content: segment.content,
      };
    case 'permission':
      return {
        type: 'permission',
        request: {
          toolId: segment.request.toolId,
          toolName: segment.request.toolName,
          reason: segment.request.reason,
        },
        status: segment.status,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
      };
    default:
      return segment;
  }
}

export function sanitizeMessage(message: Message): Message {
  const base = {
    id: message.id,
    attachments: message.attachments ? [...message.attachments] : undefined,
    agentId: message.agentId,
    model: message.model,
    createdAt: message.createdAt,
    segments: message.segments?.map(sanitizeMessageSegment),
    status: message.status,
    startedAt: message.startedAt,
    endedAt: message.endedAt,
  };

  if (message.role === 'assistant') {
    return {
      ...base,
      role: 'assistant',
    };
  }

  return {
    ...base,
    role: message.role,
    content: message.content,
  };
}

function sanitizeRuntime(runtime: StreamRuntime | undefined, updatedAt: number): StreamRuntime {
  return runtime
    ? {
        state: runtime.state,
        reason: runtime.reason,
        message: runtime.message,
        attempt: runtime.attempt,
        retryAt: runtime.retryAt,
        retryInSeconds: runtime.retryInSeconds,
        updatedAt: runtime.updatedAt,
      }
    : {
        state: 'idle',
        updatedAt,
      };
}

export function sanitizeSession(session: Session): Session {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    workspacePath: session.workspacePath,
    messages: (session.messages || []).map(sanitizeMessage),
    pinned: session.pinned,
    archived: session.archived,
    hasUnreadCompleted: session.hasUnreadCompleted,
    taskDockMinimized: session.taskDockMinimized,
    appendDockMinimized: session.appendDockMinimized,
    parentId: session.parentId,
    queuedMessages: (session.queuedMessages || []).map((queuedMessage) => ({
      id: queuedMessage.id,
      message: sanitizeMessage(queuedMessage.message),
      mode: queuedMessage.mode,
      priority: queuedMessage.priority,
      createdAt: queuedMessage.createdAt,
    })),
    queueState: session.queueState,
    usage: session.usage
      ? {
          inputTokens: session.usage.inputTokens,
          outputTokens: session.usage.outputTokens,
        }
      : undefined,
    tokenCount: session.tokenCount,
    permissionGrants: session.permissionGrants ? [...session.permissionGrants] : undefined,
    subagentResult: session.subagentResult
      ? {
          result: session.subagentResult.result,
          isError: session.subagentResult.isError,
          endedAt: session.subagentResult.endedAt,
        }
      : undefined,
    runtime: sanitizeRuntime(session.runtime, session.updatedAt),
    error: session.error,
  };
}
