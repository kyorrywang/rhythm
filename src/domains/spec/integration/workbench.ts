import { readWorkspaceTextFile, writeWorkspaceTextFile } from '@/core/runtime/api/commands';
import {
  applyEditableSpecDocuments,
  createSpecDraftState,
  reduceApproveHumanTask,
  reducePauseSpecRun,
  reduceResumeSpecRun,
  reduceRetrySpecTask,
  reduceStartSpecRun,
  type CreateSpecDraftInput,
  type SpecEditableDocumentBundle,
} from '../application/editor';
import type { SpecState, SpecTimelineEvent } from '../domain/types';
import { renderSpecChangeMarkdown, renderSpecPlanMarkdown, renderSpecTasksMarkdown } from '../infra/markdown';

export interface SpecWorkbenchLoadResult {
  state: SpecState;
  documents: SpecEditableDocumentBundle;
  timeline: SpecTimelineEvent[];
}

export interface SpecWorkbenchTransition {
  state: SpecState;
  event: SpecTimelineEvent | null;
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

export function renderSpecDocuments(state: SpecState): SpecEditableDocumentBundle {
  return {
    change: renderSpecChangeMarkdown({
      title: state.change.title,
      goal: state.change.goal,
      overview: state.change.overview,
      scope: state.change.scope,
      constraints: state.change.constraints,
      successCriteria: state.change.successCriteria,
      nonGoals: state.change.nonGoals,
      risks: state.change.risks,
      affectedAreas: state.change.affectedAreas,
    }),
    plan: renderSpecPlanMarkdown(state),
    tasks: renderSpecTasksMarkdown(state),
  };
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

async function persistSpecWorkspaceState(
  workspacePath: string,
  state: SpecState,
  documents: SpecEditableDocumentBundle,
  timeline: SpecTimelineEvent[],
) {
  const paths = getSpecRelativePaths(state.change.slug);
  await Promise.all([
    writeWorkspaceTextFile(workspacePath, paths.change, documents.change),
    writeWorkspaceTextFile(workspacePath, paths.plan, documents.plan),
    writeWorkspaceTextFile(workspacePath, paths.tasks, documents.tasks),
    writeWorkspaceTextFile(workspacePath, paths.state, JSON.stringify(state, null, 2)),
    writeWorkspaceTextFile(workspacePath, paths.timeline, serializeTimeline(timeline)),
  ]);
}

export async function loadSpecWorkbenchState(workspacePath: string, slug: string): Promise<SpecWorkbenchLoadResult> {
  const paths = getSpecRelativePaths(slug);
  const [stateFile, changeFile, planFile, tasksFile, timelineFile] = await Promise.all([
    readWorkspaceTextFile(workspacePath, paths.state),
    readWorkspaceTextFile(workspacePath, paths.change),
    readWorkspaceTextFile(workspacePath, paths.plan),
    readWorkspaceTextFile(workspacePath, paths.tasks),
    readWorkspaceTextFile(workspacePath, paths.timeline).catch(() => null),
  ]);

  if (!stateFile.content) {
    throw new Error(`Missing spec state for ${slug}.`);
  }

  const state = JSON.parse(stateFile.content) as SpecState;
  return {
    state,
    documents: {
      change: changeFile.content || renderSpecDocuments(state).change,
      plan: planFile.content || renderSpecDocuments(state).plan,
      tasks: tasksFile.content || renderSpecDocuments(state).tasks,
    },
    timeline: timelineFile?.content ? parseTimeline(timelineFile.content) : [],
  };
}

export async function createSpecDraftInWorkspace(workspacePath: string, input: CreateSpecDraftInput) {
  const state = createSpecDraftState(input);
  const documents = renderSpecDocuments(state);
  const paths = getSpecRelativePaths(state.change.slug);

  await Promise.all([
    writeWorkspaceTextFile(workspacePath, paths.change, documents.change),
    writeWorkspaceTextFile(workspacePath, paths.plan, documents.plan),
    writeWorkspaceTextFile(workspacePath, paths.tasks, documents.tasks),
    writeWorkspaceTextFile(workspacePath, paths.state, JSON.stringify(state, null, 2)),
    writeWorkspaceTextFile(workspacePath, paths.timeline, ''),
    writeWorkspaceTextFile(workspacePath, paths.agentSessions, '[]'),
  ]);

  return state;
}

export async function saveEditableSpecDocumentsInWorkspace(
  workspacePath: string,
  state: SpecState,
  documents: SpecEditableDocumentBundle,
  timeline: SpecTimelineEvent[],
) {
  const nextState = applyEditableSpecDocuments(state, documents);
  const nextDocuments = renderSpecDocuments(nextState);
  await persistSpecWorkspaceState(workspacePath, nextState, nextDocuments, timeline);
  return nextState;
}

export async function syncSpecWorkbenchFromDisk(workspacePath: string, slug: string) {
  const loaded = await loadSpecWorkbenchState(workspacePath, slug);
  const nextState = applyEditableSpecDocuments(loaded.state, loaded.documents);
  const nextDocuments = renderSpecDocuments(nextState);
  await persistSpecWorkspaceState(workspacePath, nextState, nextDocuments, loaded.timeline);
  return { state: nextState, documents: nextDocuments, timeline: loaded.timeline };
}

export async function startSpecRunInWorkspace(
  workspacePath: string,
  state: SpecState,
  documents: SpecEditableDocumentBundle,
  timeline: SpecTimelineEvent[],
) {
  const preparedState = applyEditableSpecDocuments(state, documents);
  const transition = reduceStartSpecRun(preparedState);
  const nextTimeline = appendTimelineEvent(timeline, transition.event);
  const nextDocuments = renderSpecDocuments(transition.state);
  await persistSpecWorkspaceState(workspacePath, transition.state, nextDocuments, nextTimeline);
  return { ...transition, documents: nextDocuments, timeline: nextTimeline };
}

export async function pauseSpecRunInWorkspace(workspacePath: string, state: SpecState, timeline: SpecTimelineEvent[]) {
  const transition = reducePauseSpecRun(state);
  const nextTimeline = appendTimelineEvent(timeline, transition.event);
  const nextDocuments = renderSpecDocuments(transition.state);
  await persistSpecWorkspaceState(workspacePath, transition.state, nextDocuments, nextTimeline);
  return { ...transition, documents: nextDocuments, timeline: nextTimeline };
}

export async function resumeSpecRunInWorkspace(workspacePath: string, state: SpecState, timeline: SpecTimelineEvent[]) {
  const transition = reduceResumeSpecRun(state);
  const nextTimeline = appendTimelineEvent(timeline, transition.event);
  const nextDocuments = renderSpecDocuments(transition.state);
  await persistSpecWorkspaceState(workspacePath, transition.state, nextDocuments, nextTimeline);
  return { ...transition, documents: nextDocuments, timeline: nextTimeline };
}

export async function approveSpecHumanTaskInWorkspace(workspacePath: string, state: SpecState, timeline: SpecTimelineEvent[]) {
  const transition = reduceApproveHumanTask(state);
  const nextTimeline = appendTimelineEvent(timeline, transition.event);
  const nextDocuments = renderSpecDocuments(transition.state);
  await persistSpecWorkspaceState(workspacePath, transition.state, nextDocuments, nextTimeline);
  return { ...transition, documents: nextDocuments, timeline: nextTimeline };
}

export async function retrySpecTaskInWorkspace(workspacePath: string, state: SpecState, timeline: SpecTimelineEvent[]) {
  const transition = reduceRetrySpecTask(state);
  const nextTimeline = appendTimelineEvent(timeline, transition.event);
  const nextDocuments = renderSpecDocuments(transition.state);
  await persistSpecWorkspaceState(workspacePath, transition.state, nextDocuments, nextTimeline);
  return { ...transition, documents: nextDocuments, timeline: nextTimeline };
}
