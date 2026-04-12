import {
  renderSpecChangeMarkdown,
  renderSpecPlanMarkdown,
  renderSpecTasksMarkdown,
} from '../infra/markdown';
import type { SpecChangeScaffoldInput } from '../domain/contracts';
import type {
  SpecState,
  SpecTimelineEvent,
} from '../domain/types';
import { computeSpecArtifactMetrics, computeSpecTaskMetrics, refreshDerivedSpecState } from '../domain/derived';
import {
  applyEditableSpecDocuments,
  canResumeSpecFromUi,
  canStartSpecFromUi,
  createSpecDraftState,
  reduceApproveHumanTask,
  reducePauseSpecRun,
  reduceResumeSpecRun,
  reduceRetrySpecTask,
  reduceStartSpecRun,
  type SpecEditableDocumentBundle,
} from '../application/editor';

export type SpecDocumentId = 'change' | 'plan' | 'tasks' | 'timeline';

export interface SpecWorkbenchPayload {
  slug?: string;
  documentId?: SpecDocumentId;
  mode?: 'create' | 'browse';
}

export interface SpecDocumentBundle extends SpecEditableDocumentBundle {}

export function makeSpecSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'change';
}

export function getSpecRelativePaths(slug: string) {
  return {
    root: `.spec/changes/${slug}`,
    change: `.spec/changes/${slug}/change.md`,
    plan: `.spec/changes/${slug}/plan.md`,
    tasks: `.spec/changes/${slug}/tasks.md`,
    state: `.spec/changes/${slug}/state.json`,
    timeline: `.spec/changes/${slug}/timeline.jsonl`,
    agentSessions: `.spec/changes/${slug}/agent-sessions.json`,
  };
}

export function refreshSpecStateForUi(state: SpecState): SpecState {
  return refreshDerivedSpecState({
    ...state,
    metrics: {
      tasks: computeSpecTaskMetrics(state.tasks),
      artifacts: computeSpecArtifactMetrics(state),
    },
  });
}

export function renderSpecDocumentBundle(state: SpecState): SpecDocumentBundle {
  const scaffold: SpecChangeScaffoldInput = {
    title: state.change.title,
    goal: state.change.goal,
    overview: state.change.overview,
    scope: state.change.scope,
    constraints: state.change.constraints,
    successCriteria: state.change.successCriteria,
    nonGoals: state.change.nonGoals,
    risks: state.change.risks,
    affectedAreas: state.change.affectedAreas,
  };
  return {
    change: renderSpecChangeMarkdown(scaffold),
    plan: renderSpecPlanMarkdown(state),
    tasks: renderSpecTasksMarkdown(state),
  };
}

export function applyEditableDocumentsToState(state: SpecState, docs: SpecDocumentBundle) {
  return applyEditableSpecDocuments(state, docs);
}

export function startSpecRunFromUi(state: SpecState) {
  return reduceStartSpecRun(state);
}

export function pauseSpecRunFromUi(state: SpecState) {
  return reducePauseSpecRun(state);
}

export function resumeSpecRunFromUi(state: SpecState) {
  return reduceResumeSpecRun(state);
}

export function approveHumanTaskFromUi(state: SpecState) {
  return reduceApproveHumanTask(state);
}

export function retryFailedTaskFromUi(state: SpecState) {
  return reduceRetrySpecTask(state);
}

export function appendTimelineEvent(events: SpecTimelineEvent[], event: SpecTimelineEvent | null) {
  return event ? [...events, event] : events;
}

export function serializeTimeline(events: SpecTimelineEvent[]) {
  return events.map((event) => JSON.stringify(event)).join('\n');
}

export function parseTimeline(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SpecTimelineEvent);
}

export function isSpecEditableStatus(status: SpecState['change']['status']) {
  return ['draft', 'planned', 'ready', 'paused'].includes(status);
}

export { canResumeSpecFromUi, canStartSpecFromUi, createSpecDraftState };

export function describeSpecStatus(status: SpecState['change']['status']) {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'planned':
      return 'Planned';
    case 'ready':
      return 'Ready';
    case 'running':
      return 'Running';
    case 'waiting_review':
      return 'Waiting Review';
    case 'waiting_human':
      return 'Waiting Human';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'archived':
      return 'Archived';
    default:
      return status;
  }
}

export function badgeToneForSpecStatus(status: SpecState['change']['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'waiting_review' || status === 'waiting_human' || status === 'paused') return 'warning' as const;
  if (status === 'failed' || status === 'cancelled') return 'danger' as const;
  if (status === 'draft' || status === 'planned' || status === 'ready') return 'muted' as const;
  return 'default' as const;
}
