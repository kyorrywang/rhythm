export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
  rawArguments?: string;
  isPreparing?: boolean;
  result?: string;
  status: 'running' | 'completed' | 'error' | 'interrupted';
  logs?: string[];
  startedAt?: number;
  endedAt?: number;
  subSessionId?: string;
}

export interface Task {
  id: string;
  text: string;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export type SelectionType = 'single_with_input' | 'multiple_with_input';

export interface AskQuestion {
  question: string;
  options: string[];
  selectionType: SelectionType;
}

export interface AskRequest {
  toolId: string;
  title: string;
  question: string;
  options: string[];
  selectionType: SelectionType;
  questions?: AskQuestion[];
}

export interface PermissionRequestEvent {
  toolId: string;
  toolName: string;
  reason: string;
}

export interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
}

export type StreamRuntimeState =
  | 'idle'
  | 'starting'
  | 'streaming'
  | 'backoff_waiting'
  | 'retrying'
  | 'waiting_for_permission'
  | 'waiting_for_user'
  | 'interrupting'
  | 'interrupted'
  | 'completed'
  | 'failed';

export type StreamRuntimeReason =
  | 'rate_limit'
  | 'permission'
  | 'user_input'
  | 'interrupt'
  | 'completed'
  | 'error'
  | 'unknown';

export interface StreamRuntime {
  state: StreamRuntimeState;
  reason?: StreamRuntimeReason;
  message?: string;
  attempt?: number;
  retryAt?: number;
  retryInSeconds?: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  kind: 'image' | 'file';
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  previewUrl?: string;
  text?: string;
}

type EventChunkBase = {
  sessionId: string;
  eventId?: number;
  timestamp?: number;
};

export type ServerEventChunk =
  | (EventChunkBase & { type: 'runtime_status'; state: StreamRuntimeState; reason?: StreamRuntimeReason; message?: string; attempt?: number; retryAt?: number; retryInSeconds?: number })
  | (EventChunkBase & { type: 'heartbeat' })
  | (EventChunkBase & { type: 'text_delta'; content: string })
  | (EventChunkBase & { type: 'thinking_delta'; content: string })
  | (EventChunkBase & { type: 'thinking_end' })
  | (EventChunkBase & { type: 'tool_start'; toolId: string; toolName: string; args: unknown })
  | (EventChunkBase & { type: 'tool_call_delta'; toolId: string; toolName: string; argumentsText: string })
  | (EventChunkBase & { type: 'tool_output'; toolId: string; logLine: string })
  | (EventChunkBase & { type: 'tool_result'; toolId: string; result: string; isError: boolean })
  | (EventChunkBase & { type: 'tool_end'; toolId: string; exitCode: number })
  | (EventChunkBase & { type: 'ask_request'; toolId: string; title: string; question: string; options: string[]; selectionType: SelectionType; questions?: AskQuestion[] })
  | (EventChunkBase & { type: 'task_update'; tasks: Task[] })
  | (EventChunkBase & { type: 'subagent_start'; parentSessionId: string; parentToolCallId: string; subSessionId: string; title: string; message: string; startedAt: number })
  | (EventChunkBase & { type: 'subagent_end'; parentSessionId: string; parentToolCallId: string; subSessionId: string; result: string; isError: boolean })
  | (EventChunkBase & { type: 'permission_request'; toolId: string; toolName: string; reason: string })
  | (EventChunkBase & { type: 'done' })
  | (EventChunkBase & { type: 'interrupted' })
  | (EventChunkBase & { type: 'failed' })
  | (EventChunkBase & { type: 'usage_update'; inputTokens: number; outputTokens: number })
  | (EventChunkBase & { type: 'cron_job_triggered'; jobId: string; name: string })
  | (EventChunkBase & { type: 'cron_job_completed'; jobId: string; name: string; success: boolean; output: string; durationMs: number });

export interface QueuedMessage {
  id: string;
  message: Message;
  mode?: 'normal' | 'build' | 'task' | 'ask' | 'append';
  priority: 'normal' | 'urgent';
  createdAt: number;
}

export type SessionQueueState =
  | 'idle'
  | 'streaming_with_queue'
  | 'processing_queue'
  | 'interrupting';

export type MessageSegment =
  | { type: 'thinking'; content: string; isLive?: boolean; startedAt?: number; endedAt?: number }
  | { type: 'tool'; tool: ToolCall }
  | { type: 'ask'; toolId: string; title: string; question: string; options: string[]; selectionType: SelectionType; questions?: AskQuestion[]; status: 'waiting' | 'answered'; answer?: { selected: string[]; text: string }; startedAt?: number; endedAt?: number }
  | { type: 'tasks'; tasks: Task[]; startedAt?: number; endedAt?: number }
  | { type: 'retry'; state: 'backoff_waiting' | 'retrying'; reason?: StreamRuntimeReason; message: string; attempt: number; retryAt?: number; retryInSeconds?: number; updatedAt: number }
  | { type: 'text'; content: string }
  | { type: 'permission'; request: PermissionRequestEvent; status: 'waiting' | 'approved' | 'denied'; startedAt?: number; endedAt?: number };

export interface BaseMessage {
  id: string;
  attachments?: Attachment[];
  agentId?: string;
  slashCommandName?: string;
  contextPolicy?: 'default' | 'exclude';
  model?: string;
  createdAt: number;
  segments?: MessageSegment[];
  status?: 'running' | 'waiting_for_user' | 'waiting_for_permission' | 'completed';
  startedAt?: number;
  endedAt?: number;
}

export interface UserOrSystemMessage extends BaseMessage {
  role: 'user' | 'system';
  content?: string;
}

export interface AssistantMessage extends BaseMessage {
  role: 'assistant';
  content?: never;
}

export type Message = UserOrSystemMessage | AssistantMessage;

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
  workspacePath?: string;
  messages: Message[];
  pinned?: boolean;
  archived?: boolean;
  hasUnreadCompleted?: boolean;
  taskDockMinimized?: boolean;
  appendDockMinimized?: boolean;
  parentId?: string;
  queuedMessages?: QueuedMessage[];
  queueState?: SessionQueueState;
  usage?: UsageSnapshot;
  tokenCount?: number;
  permissionGrants?: string[];
  subagentResult?: {
    result: string;
    isError: boolean;
    endedAt: number;
  };
  runtime?: StreamRuntime;
  error?: string | null;
}
