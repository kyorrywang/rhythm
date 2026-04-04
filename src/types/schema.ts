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

export interface AskRequest {
  toolId: string;
  question: string;
  options: string[];
}

export type ServerEventChunk = 
  | { type: 'text_delta'; content: string } 
  | { type: 'thinking_delta'; content: string }
  | { type: 'thinking_end'; timeCostMs: number }
  | { type: 'tool_start'; toolId: string; toolName: string; args: any }
  | { type: 'tool_output'; toolId: string; logLine: string }
  | { type: 'tool_end'; toolId: string; exitCode: number }
  | { type: 'ask_request'; toolId: string; question: string; options: string[] }
  | { type: 'task_update'; tasks: Task[] }
  | { type: 'subagent_start'; parentSessionId: string; subSessionId: string; title: string }
  | { type: 'done' };

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
}

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
  running: boolean;
  messages: Message[];
  parentId?: string;
  queuedMessages?: Message[];
  currentAsk?: AskRequest | null;
  currentTasks?: Task[];
}
