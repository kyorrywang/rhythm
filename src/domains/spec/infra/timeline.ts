import fs from 'node:fs/promises';
import { getSpecChangePaths } from './changeFs';
import { deserializeSpecTimeline, serializeSpecTimelineEvent } from './serializer';
import type { SpecState, SpecTimelineEvent } from '../domain/types';

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateSpecTimelineEventInput<TPayload = Record<string, unknown>> {
  state: SpecState;
  type: SpecTimelineEvent<TPayload>['type'];
  title: string;
  detail: string;
  runId?: string;
  taskId?: string;
  payload?: TPayload;
  createdAt?: number;
}

export function createSpecTimelineEvent<TPayload = Record<string, unknown>>(
  input: CreateSpecTimelineEventInput<TPayload>,
): SpecTimelineEvent<TPayload> {
  return {
    id: createId('evt'),
    changeId: input.state.change.id,
    runId: input.runId ?? input.state.change.currentRunId ?? undefined,
    taskId: input.taskId,
    type: input.type,
    title: input.title,
    detail: input.detail,
    payload: input.payload,
    createdAt: input.createdAt ?? Date.now(),
  };
}

export async function readSpecTimeline(workspacePath: string, slug: string) {
  const paths = getSpecChangePaths(workspacePath, slug);
  try {
    const raw = await fs.readFile(paths.timelineFile, 'utf8');
    return deserializeSpecTimeline(raw);
  } catch {
    return [];
  }
}

export async function appendSerializedSpecTimelineEvent(workspacePath: string, slug: string, event: SpecTimelineEvent) {
  const paths = getSpecChangePaths(workspacePath, slug);
  await fs.mkdir(paths.changeDir, { recursive: true });
  await fs.appendFile(paths.timelineFile, `${serializeSpecTimelineEvent(event)}\n`, 'utf8');
}
