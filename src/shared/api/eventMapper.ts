import type { ServerEventChunk } from '@/shared/types/schema';
import type { InternalEvent, InternalEventType } from '@/shared/types/events';

const EVENT_TYPE_MAP: Record<ServerEventChunk['type'], InternalEventType> = {
  text_delta: 'TEXT_DELTA',
  thinking_delta: 'THINKING_DELTA',
  thinking_end: 'THINKING_END',
  tool_start: 'TOOL_START',
  tool_output: 'TOOL_OUTPUT',
  tool_end: 'TOOL_END',
  ask_request: 'ASK_REQUEST',
  task_update: 'TASK_UPDATE',
  subagent_start: 'SUBAGENT_START',
  subagent_end: 'SUBAGENT_END',
  done: 'DONE',
  interrupted: 'INTERRUPTED',
  permission_request: 'PERMISSION_REQUEST',
  usage_update: 'USAGE_UPDATE',
  context_compacted: 'CONTEXT_COMPACTED',
  cron_job_triggered: 'CRON_JOB_TRIGGERED',
  cron_job_completed: 'CRON_JOB_COMPLETED',
};

export function mapServerEventToInternal(chunk: ServerEventChunk): InternalEvent {
  const { type, sessionId, ...rest } = chunk;

  return {
    type: EVENT_TYPE_MAP[type],
    sessionId,
    timestamp: Date.now(),
    payload: rest as Record<string, unknown>,
  };
}

export function isUserFacingEvent(eventType: InternalEventType): boolean {
  const silentEvents: InternalEventType[] = ['TASK_UPDATE', 'USAGE_UPDATE', 'CONTEXT_COMPACTED'];
  return !silentEvents.includes(eventType);
}

export function isTerminalEvent(eventType: InternalEventType): boolean {
  return eventType === 'DONE' || eventType === 'INTERRUPTED';
}

export function isBlockingEvent(eventType: InternalEventType): boolean {
  return eventType === 'PERMISSION_REQUEST' || eventType === 'ASK_REQUEST';
}
