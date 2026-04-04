export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
  result?: string;
  status: 'running' | 'completed' | 'error';
  executionTime?: number;
  logs?: string[];
}

export type ServerEventChunk = 
  | { type: 'text_delta'; content: string } 
  | { type: 'thinking_end'; timeCostMs: number }
  | { type: 'tool_start'; toolId: string; toolName: string; args: any }
  | { type: 'tool_output'; toolId: string; logLine: string }
  | { type: 'tool_end'; toolId: string; exitCode: number }
  | { type: 'done' };

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode?: 'normal' | 'build' | 'task' | 'ask' | 'append';
  toolCalls?: ToolCall[];
  createdAt: number;
  isThinking?: boolean;
  thinkingTimeCostMs?: number;
}

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
  running: boolean;
  messages: Message[];
}
