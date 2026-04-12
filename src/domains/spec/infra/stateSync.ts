import fs from 'node:fs/promises';
import { SPEC_AGENT_PROFILE_IDS } from './agents';
import { getSpecChangePaths, makeSpecChangeSlug } from './changeFs';
import type { SpecChangeScaffoldInput } from '../domain/contracts';
import { computeSpecTaskMetrics, refreshDerivedSpecState } from '../domain/derived';
import {
  renderSpecChangeMarkdown,
  renderSpecPlanMarkdown,
  renderSpecTasksMarkdown,
} from './markdown';
import { applyEditableSpecDocuments } from '../application/editor';
import type { SpecPlan, SpecRun, SpecState } from '../domain/types';

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
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
      tasks: computeSpecTaskMetrics([]),
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

export async function syncSpecStateFromMarkdown(workspacePath: string, slug: string, state: SpecState) {
  const paths = getSpecChangePaths(workspacePath, slug);
  const [changeMd, planMd, tasksMd] = await Promise.all([
    fs.readFile(paths.changeFile, 'utf8').catch(() => ''),
    fs.readFile(paths.planFile, 'utf8').catch(() => ''),
    fs.readFile(paths.tasksFile, 'utf8').catch(() => ''),
  ]);
  return applyEditableSpecDocuments(state, { change: changeMd, plan: planMd, tasks: tasksMd });
}
