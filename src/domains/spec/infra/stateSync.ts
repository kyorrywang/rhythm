import fs from 'node:fs/promises';
import { SPEC_AGENT_PROFILE_IDS } from './agents';
import { getSpecChangePaths, makeSpecChangeSlug } from './changeFs';
import type { SpecChangeScaffoldInput } from '../domain/contracts';
import { renderSpecChangeMarkdown, renderSpecPlanMarkdown, renderSpecTasksMarkdown } from './markdown';
import type { SpecPlan, SpecRun, SpecState, SpecTask } from '../domain/types';

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function computeTaskMetrics(tasks: SpecTask[]) {
  const currentTask = tasks.find((task) => task.status === 'running') || null;
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    running: tasks.filter((task) => task.status === 'running').length,
    blocked: tasks.filter((task) => task.status === 'blocked').length,
    waitingReview: tasks.filter((task) => task.status === 'waiting_review').length,
    waitingHuman: tasks.filter((task) => task.status === 'waiting_human').length,
    currentTaskTitle: currentTask?.title || null,
  };
}

function computeArtifactMetrics(state: SpecState) {
  return {
    accepted: state.artifacts.filter((artifact) => artifact.status === 'accepted').length,
    draft: state.artifacts.filter((artifact) => artifact.status === 'draft' || artifact.status === 'review_submitted').length,
    rejected: state.artifacts.filter((artifact) => artifact.status === 'rejected').length,
  };
}

export function buildInitialSpecState(input: SpecChangeScaffoldInput): SpecState {
  const now = Date.now();
  const changeId = createId('spec_change');
  const runId = createId('spec_run');
  const plan: SpecPlan = {
    changeId,
    version: 0,
    summary: input.overview || '',
    approach: '',
    stages: [],
    checkpoints: [],
    reviewStrategy: [],
    openQuestions: [],
    createdAt: now,
    updatedAt: now,
  };
  const initialRun: SpecRun = {
    id: runId,
    changeId,
    status: 'pending',
    currentStageId: null,
    currentTaskId: null,
    activeTaskCount: 0,
    engineHealthSummary: 'Spec scaffold created and waiting for planning.',
    watchdogStatus: 'healthy',
    createdAt: now,
    updatedAt: now,
  };
  return {
    schemaVersion: 1,
    mode: 'spec',
    change: {
      id: changeId,
      slug: '',
      title: input.title,
      status: 'draft',
      goal: input.goal,
      overview: input.overview || '',
      scope: input.scope || [],
      nonGoals: input.nonGoals || [],
      constraints: input.constraints || [],
      risks: input.risks || [],
      successCriteria: input.successCriteria || [],
      affectedAreas: input.affectedAreas || [],
      currentPlanVersion: 0,
      currentRunId: runId,
      currentTaskId: null,
      createdAt: now,
      updatedAt: now,
    },
    plan,
    tasks: [],
    artifacts: [],
    reviews: [],
    runs: [initialRun],
    metrics: {
      tasks: computeTaskMetrics([]),
      artifacts: { accepted: 0, draft: 0, rejected: 0 },
    },
    execution: {
      activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.planner,
      maintenanceLeaseOwnerId: null,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function refreshDerivedSpecState(state: SpecState): SpecState {
  const tasks = computeTaskMetrics(state.tasks);
  const artifacts = computeArtifactMetrics(state);
  const currentRun = state.runs.find((run) => run.id === state.change.currentRunId) || state.runs.at(-1) || null;
  const currentTaskId = currentRun?.currentTaskId
    || state.tasks.find((task) => task.title === tasks.currentTaskTitle)?.id
    || null;

  return {
    ...state,
    change: {
      ...state.change,
      currentTaskId,
      updatedAt: Date.now(),
    },
    metrics: {
      tasks,
      artifacts,
    },
    updatedAt: Date.now(),
  };
}

export function renderSpecFilesFromState(state: SpecState) {
  const changeInput: SpecChangeScaffoldInput = {
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
    change: renderSpecChangeMarkdown(changeInput),
    plan: renderSpecPlanMarkdown(state),
    tasks: renderSpecTasksMarkdown(state),
    state: JSON.stringify(state, null, 2),
  };
}

export async function createSpecChangeScaffold(workspacePath: string, input: SpecChangeScaffoldInput) {
  const initialState = buildInitialSpecState(input);
  const slug = makeSpecChangeSlug(input.title);
  const state = refreshDerivedSpecState({
    ...initialState,
    change: {
      ...initialState.change,
      slug,
    },
  });
  const paths = getSpecChangePaths(workspacePath, slug);
  const rendered = renderSpecFilesFromState(state);

  await fs.mkdir(paths.artifactsDir, { recursive: true });
  await fs.mkdir(paths.reviewsDir, { recursive: true });
  await fs.mkdir(paths.runsDir, { recursive: true });
  await fs.writeFile(paths.changeFile, rendered.change, 'utf8');
  await fs.writeFile(paths.planFile, rendered.plan, 'utf8');
  await fs.writeFile(paths.tasksFile, rendered.tasks, 'utf8');
  await fs.writeFile(paths.stateFile, rendered.state, 'utf8');
  await fs.writeFile(paths.timelineFile, '', 'utf8');

  return { state, paths };
}
