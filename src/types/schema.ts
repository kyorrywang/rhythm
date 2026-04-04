export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
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

export type ServerEventChunk =
  | { type: 'text_delta'; sessionId: string; content: string }
  | { type: 'thinking_delta'; sessionId: string; content: string }
  | { type: 'thinking_end'; sessionId: string; timeCostMs: number }
  | { type: 'tool_start'; sessionId: string; toolId: string; toolName: string; args: any }
  | { type: 'tool_output'; sessionId: string; toolId: string; logLine: string }
  | { type: 'tool_end'; sessionId: string; toolId: string; exitCode: number }
  | { type: 'ask_request'; sessionId: string; toolId: string; question: string; options: string[]; selectionType?: SelectionType; questions?: AskQuestion[] }
  | { type: 'ask_answered'; sessionId: string; answer: { selected: string[]; text: string } }
  | { type: 'task_update'; sessionId: string; tasks: Task[] }
  | { type: 'subagent_start'; sessionId: string; parentSessionId: string; subSessionId: string; title: string }
  | { type: 'subagent_end'; sessionId: string; subSessionId: string; result: string; isError: boolean }
  | { type: 'done'; sessionId: string }
  | { type: 'interrupted'; sessionId: string };

export interface QueuedMessage {
  id: string;
  message: Message;
  priority: 'normal' | 'urgent';
  createdAt: number;
}

export type SessionPhase =
  | 'idle'
  | 'streaming'
  | 'streaming_with_queue'
  | 'processing_queue'
  | 'waiting_for_ask'
  | 'interrupting';

export type MessageSegment =
  | { type: 'thinking'; content: string; timeCostMs?: number; isLive?: boolean; startTime?: number }
  | { type: 'tool'; tool: ToolCall }
  | { type: 'ask'; question: string; options: string[]; selectionType?: SelectionType; questions?: AskQuestion[]; status: 'waiting' | 'answered'; answer?: { selected: string[]; text: string } }
  | { type: 'text'; content: string };

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode?: 'normal' | 'build' | 'task' | 'ask' | 'append';
  toolCalls?: ToolCall[];
  createdAt: number;
  segments?: MessageSegment[];
  status?: 'running' | 'waiting_for_user' | 'completed';
  totalTimeMs?: number;
}

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
  running: boolean;
  messages: Message[];
  parentId?: string;
  queuedMessages?: QueuedMessage[];
  currentAsk?: AskRequest | null;
  currentTasks?: Task[];
  phase?: SessionPhase;
}
