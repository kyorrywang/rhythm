import type { ServerEventChunk } from '@/shared/types/schema';
import type { InternalEvent, InternalEventType } from '@/shared/types/events';

const EVENT_TYPE_MAP: Record<ServerEventChunk['type'], InternalEventType> = {
  runtime_status: 'RUNTIME_STATUS',
  heartbeat: 'RUNTIME_HEARTBEAT',
  text_delta: 'TEXT_DELTA',
  thinking_delta: 'THINKING_DELTA',
  thinking_end: 'THINKING_END',
  tool_start: 'TOOL_START',
  tool_call_delta: 'TOOL_CALL_DELTA',
  tool_output: 'TOOL_OUTPUT',
  tool_result: 'TOOL_RESULT',
  tool_end: 'TOOL_END',
  ask_request: 'ASK_REQUEST',
  task_update: 'TASK_UPDATE',
  subagent_start: 'SUBAGENT_START',
  subagent_end: 'SUBAGENT_END',
  done: 'DONE',
  interrupted: 'INTERRUPTED',
  failed: 'FAILED',
  permission_request: 'PERMISSION_REQUEST',
  usage_update: 'USAGE_UPDATE',
  cron_job_triggered: 'CRON_JOB_TRIGGERED',
  cron_job_completed: 'CRON_JOB_COMPLETED',
};

export function mapServerEventToInternal(chunk: ServerEventChunk): InternalEvent {
  const { type, sessionId, timestamp, ...rest } = chunk;

  return {
    type: EVENT_TYPE_MAP[type],
    sessionId,
    timestamp: timestamp ?? Date.now(),
    payload: rest as Record<string, unknown>,
  };
}

export function isUserFacingEvent(eventType: InternalEventType): boolean {
  const silentEvents: InternalEventType[] = ['TASK_UPDATE', 'USAGE_UPDATE'];
  return !silentEvents.includes(eventType);
}

export function isTerminalEvent(eventType: InternalEventType): boolean {
  return eventType === 'DONE' || eventType === 'INTERRUPTED' || eventType === 'FAILED';
}

export function isBlockingEvent(eventType: InternalEventType): boolean {
  return eventType === 'PERMISSION_REQUEST' || eventType === 'ASK_REQUEST';
}
