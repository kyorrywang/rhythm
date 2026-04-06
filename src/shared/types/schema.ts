export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
  result?: string;
  status: 'running' | 'completed' | 'error';
  executionTime?: number;
  logs?: string[];
  startTime?: number;
  subSessionId?: string;
}

export interface Task {
  id: string;
  text: string;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export type SelectionType = 'single' | 'multiple' | 'input' | 'single_with_input' | 'multiple_with_input';

export interface AskQuestion {
  question: string;
  options: string[];
  selectionType?: SelectionType;
}

export interface AskRequest {
  toolId: string;
  question: string;
  options: string[];
  selectionType?: SelectionType;
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

export type ServerEventChunk =
  | { type: 'text_delta'; sessionId: string; content: string }
  | { type: 'thinking_delta'; sessionId: string; content: string }
  | { type: 'thinking_end'; sessionId: string; timeCostMs: number }
  | { type: 'tool_start'; sessionId: string; toolId: string; toolName: string; args: unknown }
  | { type: 'tool_output'; sessionId: string; toolId: string; logLine: string }
  | { type: 'tool_end'; sessionId: string; toolId: string; exitCode: number }
  | { type: 'ask_request'; sessionId: string; toolId: string; question: string; options: string[]; selectionType?: SelectionType; questions?: AskQuestion[] }
  | { type: 'task_update'; sessionId: string; tasks: Task[] }
  | { type: 'subagent_start'; sessionId: string; parentSessionId: string; subSessionId: string; title: string; message: string }
  | { type: 'subagent_end'; sessionId: string; subSessionId: string; result: string; isError: boolean }
  | { type: 'permission_request'; sessionId: string; toolId: string; toolName: string; reason: string }
  | { type: 'done'; sessionId: string }
  | { type: 'interrupted'; sessionId: string }
  | { type: 'max_turns_exceeded'; sessionId: string; turns: number }
  | { type: 'context_compacted'; sessionId: string; compactType: 'micro' | 'full'; tokensSaved?: number }
  | { type: 'cron_job_triggered'; sessionId: string; jobId: string; name: string }
  | { type: 'cron_job_completed'; sessionId: string; jobId: string; name: string; success: boolean; output: string; durationMs: number };

export interface QueuedMessage {
  id: string;
  message: Message;
  mode?: 'normal' | 'build' | 'task' | 'ask' | 'append';
  priority: 'normal' | 'urgent';
  createdAt: number;
}

export type SessionPhase =
  | 'idle'
  | 'streaming'
  | 'streaming_with_queue'
  | 'processing_queue'
  | 'waiting_for_ask'
  | 'interrupting'
  | 'waiting_for_permission';

export type MessageSegment =
  | { type: 'thinking'; content: string; timeCostMs?: number; isLive?: boolean; startTime?: number }
  | { type: 'tool'; tool: ToolCall }
  | { type: 'ask'; question: string; options: string[]; selectionType?: SelectionType; questions?: AskQuestion[]; status: 'waiting' | 'answered'; answer?: { selected: string[]; text: string }; startTime?: number; timeCostMs?: number }
  | { type: 'text'; content: string }
  | { type: 'permission'; request: PermissionRequestEvent; status: 'waiting' | 'approved' | 'denied'; startTime?: number };

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  createdAt: number;
  segments?: MessageSegment[];
  status?: 'running' | 'waiting_for_user' | 'waiting_for_permission' | 'completed';
  totalTimeMs?: number;
}

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
  taskDockMinimized?: boolean;
  appendDockMinimized?: boolean;
  parentId?: string;
  queuedMessages?: QueuedMessage[];
  currentAsk?: AskRequest | null;
  currentTasks?: Task[];
  phase?: SessionPhase;
  usage?: UsageSnapshot;
  tokenCount?: number;
  permissionPending?: boolean;
  maxTurnsReached?: number | null;
  error?: string | null;
}
