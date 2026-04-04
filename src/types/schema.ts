export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
  result?: string;
  status: 'running' | 'completed' | 'error';
  executionTime?: number;
  logs?: string[];
  startTime?: number;
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
  | { type: 'text_delta'; content: string } 
  | { type: 'thinking_delta'; content: string }
  | { type: 'thinking_end'; timeCostMs: number }
  | { type: 'tool_start'; toolId: string; toolName: string; args: any }
  | { type: 'tool_output'; toolId: string; logLine: string }
  | { type: 'tool_end'; toolId: string; exitCode: number }
  | { type: 'ask_request'; toolId: string; question: string; options: string[]; selectionType?: SelectionType; questions?: AskQuestion[] }
  | { type: 'task_update'; tasks: Task[] }
  | { type: 'subagent_start'; parentSessionId: string; subSessionId: string; title: string }
  | { type: 'done' }
  | { type: 'interrupted' };

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

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode?: 'normal' | 'build' | 'task' | 'ask' | 'append';
  toolCalls?: ToolCall[];
  createdAt: number;
  isThinking?: boolean;
  thinkingContent?: string;
  thinkingTimeCostMs?: number;
  thinkingStartTime?: number;
  hadThinking?: boolean;
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
