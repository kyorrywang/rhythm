import type { SpecState, SpecTimelineEvent } from '../domain/types';

const SPEC_STATE_SCHEMA_VERSION = 1 as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function serializeSpecState(state: SpecState) {
  return JSON.stringify(state, null, 2);
}

export function deserializeSpecState(raw: string): SpecState {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || parsed.schemaVersion !== SPEC_STATE_SCHEMA_VERSION || parsed.mode !== 'spec') {
    throw new Error('Invalid spec state payload.');
  }
  return parsed as unknown as SpecState;
}

export function serializeSpecTimelineEvent(event: SpecTimelineEvent) {
  return JSON.stringify(event);
}

export function deserializeSpecTimelineEvent(raw: string): SpecTimelineEvent {
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.type !== 'string') {
    throw new Error('Invalid spec timeline event payload.');
  }
  return parsed as unknown as SpecTimelineEvent;
}

export function deserializeSpecTimeline(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => deserializeSpecTimelineEvent(line));
}
