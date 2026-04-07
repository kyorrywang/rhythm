export type InternalEventType =
  | 'TEXT_DELTA'
  | 'THINKING_DELTA'
  | 'THINKING_END'
  | 'TOOL_START'
  | 'TOOL_OUTPUT'
  | 'TOOL_END'
  | 'ASK_REQUEST'
  | 'TASK_UPDATE'
  | 'SUBAGENT_START'
  | 'SUBAGENT_END'
  | 'DONE'
  | 'INTERRUPTED'
  | 'PERMISSION_REQUEST'
  | 'USAGE_UPDATE'
  | 'CONTEXT_COMPACTED'
  | 'CRON_JOB_TRIGGERED'
  | 'CRON_JOB_COMPLETED';

export interface InternalEvent {
  type: InternalEventType;
  sessionId: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface TextDeltaEvent extends InternalEvent {
  type: 'TEXT_DELTA';
  payload: { content: string };
}

export interface ThinkingDeltaEvent extends InternalEvent {
  type: 'THINKING_DELTA';
  payload: { content: string };
}

export interface ThinkingEndEvent extends InternalEvent {
  type: 'THINKING_END';
  payload: { timeCostMs: number };
}

export interface ToolStartEvent extends InternalEvent {
  type: 'TOOL_START';
  payload: { toolId: string; toolName: string; args: unknown };
}

export interface ToolOutputEvent extends InternalEvent {
  type: 'TOOL_OUTPUT';
  payload: { toolId: string; logLine: string };
}

export interface ToolEndEvent extends InternalEvent {
  type: 'TOOL_END';
  payload: { toolId: string; exitCode: number };
}

export interface AskRequestEvent extends InternalEvent {
  type: 'ASK_REQUEST';
  payload: {
    toolId: string;
    title: string;
    question: string;
    options: string[];
    selectionType: 'single_with_input' | 'multiple_with_input';
    questions?: Array<{ question: string; options: string[]; selectionType: 'single_with_input' | 'multiple_with_input' }>;
  };
}

export interface TaskUpdateEvent extends InternalEvent {
  type: 'TASK_UPDATE';
  payload: { tasks: Array<{ id: string; text: string; status: string }> };
}

export interface SubagentStartEvent extends InternalEvent {
  type: 'SUBAGENT_START';
  payload: {
    parentSessionId: string;
    subSessionId: string;
    title: string;
    message: string;
  };
}

export interface SubagentEndEvent extends InternalEvent {
  type: 'SUBAGENT_END';
  payload: { subSessionId: string; result: string; isError: boolean };
}

export interface DoneEvent extends InternalEvent {
  type: 'DONE';
  payload: Record<string, never>;
}

export interface InterruptedEvent extends InternalEvent {
  type: 'INTERRUPTED';
  payload: Record<string, never>;
}

export interface PermissionRequestEventInternal extends InternalEvent {
  type: 'PERMISSION_REQUEST';
  payload: {
    toolId: string;
    toolName: string;
    reason: string;
  };
}

export interface ContextCompactedEvent extends InternalEvent {
  type: 'CONTEXT_COMPACTED';
  payload: { compactType: 'micro' | 'full'; tokensSaved?: number };
}

export interface UsageUpdateEvent extends InternalEvent {
  type: 'USAGE_UPDATE';
  payload: { inputTokens: number; outputTokens: number };
}

export interface CronJobTriggeredEvent extends InternalEvent {
  type: 'CRON_JOB_TRIGGERED';
  payload: { jobId: string; name: string };
}

export interface CronJobCompletedEvent extends InternalEvent {
  type: 'CRON_JOB_COMPLETED';
  payload: { jobId: string; name: string; success: boolean; output: string; durationMs: number };
}

export type InternalEventUnion =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ThinkingEndEvent
  | ToolStartEvent
  | ToolOutputEvent
  | ToolEndEvent
  | AskRequestEvent
  | TaskUpdateEvent
  | SubagentStartEvent
  | SubagentEndEvent
  | DoneEvent
  | InterruptedEvent
  | PermissionRequestEventInternal
  | UsageUpdateEvent
  | ContextCompactedEvent
  | CronJobTriggeredEvent
  | CronJobCompletedEvent;
