import { refreshDerivedSpecState } from '../domain/derived';
import { parseSpecChangeMarkdown, parseSpecPlanMarkdown, parseSpecTasksMarkdown } from '../infra/markdown';
import { SPEC_AGENT_PROFILE_IDS } from '../infra/agents';
import type { SpecPlan, SpecRun, SpecState, SpecTask, SpecTaskSource, SpecTaskStatus, SpecTimelineEvent } from '../domain/types';

export interface SpecEditableDocumentBundle {
  change: string;
  plan: string;
  tasks: string;
}

export interface CreateSpecDraftInput {
  title: string;
  goal: string;
  overview?: string;
  constraints?: string[];
  successCriteria?: string[];
}

function createSpecId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTaskTitle(input: string) {
  return input.trim().toLowerCase();
}

function buildTaskFromChecklistItem(
  state: SpecState,
  existingTask: SpecTask | undefined,
  title: string,
  completed: boolean,
  order: number,
  eventTime: number,
): SpecTask {
  const taskId = existingTask?.id || createSpecId('spec_task');
  const fallbackStatus: SpecTaskStatus = completed ? 'completed' : order === 0 ? 'ready' : 'pending';
  const preservedLiveStatus: SpecTaskStatus | null = existingTask && !completed && ['running', 'waiting_review', 'waiting_human', 'failed', 'blocked', 'paused'].includes(existingTask.status)
    ? existingTask.status
    : null;

  return {
    id: taskId,
    changeId: state.change.id,
    runId: existingTask?.runId ?? state.change.currentRunId,
    parentTaskId: existingTask?.parentTaskId ?? null,
    rootTaskId: existingTask?.rootTaskId ?? taskId,
    stageId: existingTask?.stageId ?? null,
    title,
    kind: existingTask?.kind ?? 'work',
    nodeType: existingTask?.nodeType ?? 'leaf',
    source: existingTask?.source ?? 'user',
    status: completed ? 'completed' : preservedLiveStatus ?? fallbackStatus,
    failurePolicy: existingTask?.failurePolicy ?? 'pause',
    retryPolicy: existingTask?.retryPolicy ?? 'manual',
    assignedAgentProfileId: existingTask?.assignedAgentProfileId ?? null,
    attemptCount: existingTask?.attemptCount ?? 0,
    dependsOn: existingTask?.dependsOn ?? [],
    acceptanceCriteria: existingTask?.acceptanceCriteria ?? [],
    targetPaths: existingTask?.targetPaths ?? [],
    summary: existingTask?.summary ?? '',
    blockedReason: existingTask?.blockedReason,
    reviewRequired: existingTask?.reviewRequired ?? true,
    createdAt: existingTask?.createdAt ?? eventTime,
    updatedAt: eventTime,
  };
}

function reconcileTasksFromMarkdown(state: SpecState, markdown: string, eventTime: number) {
  const taskPatch = parseSpecTasksMarkdown(markdown);
  if (taskPatch.checklist.length === 0) {
    return state.tasks;
  }

  const existingByTitle = new Map(state.tasks.map((task) => [normalizeTaskTitle(task.title), task]));
  const nextTasks: SpecTask[] = taskPatch.checklist.map((item, index) =>
    buildTaskFromChecklistItem(state, existingByTitle.get(normalizeTaskTitle(item.title)), item.title, item.completed, index, eventTime),
  );

  const preservedSettledTasks = state.tasks.filter((task) => {
    if (existingByTitle.has(normalizeTaskTitle(task.title)) && taskPatch.checklist.some((item) => normalizeTaskTitle(item.title) === normalizeTaskTitle(task.title))) {
      return false;
    }
    return ['waiting_review', 'waiting_human', 'completed'].includes(task.status);
  });

  return [...nextTasks, ...preservedSettledTasks];
}

function createTimelineEvent(state: SpecState, type: SpecTimelineEvent['type'], title: string, detail: string, taskId?: string): SpecTimelineEvent {
  return {
    id: createSpecId('evt'),
    changeId: state.change.id,
    runId: state.change.currentRunId || undefined,
    taskId,
    type,
    title,
    detail,
    createdAt: Date.now(),
  };
}

function ensurePlanningTask(state: SpecState, eventTime: number) {
  if (state.tasks.length > 0) {
    return state.tasks;
  }
  return [{
    id: createSpecId('spec_task'),
    changeId: state.change.id,
    runId: state.change.currentRunId,
    parentTaskId: null,
    rootTaskId: createSpecId('spec_root_task'),
    stageId: null,
    title: 'Plan the change',
    kind: 'plan' as const,
    nodeType: 'leaf' as const,
    source: 'planner' as SpecTaskSource,
    status: 'running' as SpecTaskStatus,
    failurePolicy: 'pause' as const,
    retryPolicy: 'manual' as const,
    assignedAgentProfileId: SPEC_AGENT_PROFILE_IDS.planner,
    attemptCount: 1,
    dependsOn: [],
    acceptanceCriteria: ['Produce the first executable plan.'],
    targetPaths: ['plan.md'],
    summary: 'Initial planning task started.',
    reviewRequired: false,
    createdAt: eventTime,
    updatedAt: eventTime,
  }];
}

export function applyEditableSpecDocuments(state: SpecState, docs: SpecEditableDocumentBundle, eventTime = Date.now()) {
  const changePatch = parseSpecChangeMarkdown(docs.change);
  const planPatch = parseSpecPlanMarkdown(docs.plan);
  const nextTasks = reconcileTasksFromMarkdown(state, docs.tasks, eventTime);

  return refreshDerivedSpecState({
    ...state,
    change: {
      ...state.change,
      goal: changePatch.goal || state.change.goal,
      overview: changePatch.overview || state.change.overview,
      scope: changePatch.scope.length > 0 ? changePatch.scope : state.change.scope,
      nonGoals: changePatch.nonGoals.length > 0 ? changePatch.nonGoals : state.change.nonGoals,
      constraints: changePatch.constraints.length > 0 ? changePatch.constraints : state.change.constraints,
      risks: changePatch.risks.length > 0 ? changePatch.risks : state.change.risks,
      successCriteria: changePatch.successCriteria.length > 0 ? changePatch.successCriteria : state.change.successCriteria,
      status: nextTasks.length > 0 && ['draft', 'planned'].includes(state.change.status) ? 'ready' : state.change.status,
      updatedAt: eventTime,
    },
    plan: {
      ...state.plan,
      summary: planPatch.summary || state.plan.summary,
      approach: planPatch.approach || state.plan.approach,
      checkpoints: planPatch.checkpoints.length > 0 ? planPatch.checkpoints : state.plan.checkpoints,
      reviewStrategy: planPatch.reviewStrategy.length > 0 ? planPatch.reviewStrategy : state.plan.reviewStrategy,
      openQuestions: planPatch.openQuestions.length > 0 ? planPatch.openQuestions : state.plan.openQuestions,
      stages: planPatch.stages.length > 0
        ? planPatch.stages.map((stage, index) => ({
            id: state.plan.stages[index]?.id || stage.id,
            name: stage.name,
            goal: state.plan.stages[index]?.goal || stage.name,
            deliverables: state.plan.stages[index]?.deliverables || [],
            targetFolder: state.plan.stages[index]?.targetFolder || '',
            outputFiles: state.plan.stages[index]?.outputFiles || [],
            requiresReview: state.plan.stages[index]?.requiresReview ?? true,
            humanCheckpointRequired: state.plan.stages[index]?.humanCheckpointRequired ?? false,
            executorProfileId: state.plan.stages[index]?.executorProfileId,
            reviewerProfileId: state.plan.stages[index]?.reviewerProfileId,
          }))
        : state.plan.stages,
      updatedAt: eventTime,
    },
    tasks: nextTasks,
  }, eventTime);
}

export function createSpecDraftState(input: CreateSpecDraftInput) {
  const now = Date.now();
  const changeId = createSpecId('spec_change');
  const runId = createSpecId('spec_run');
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
  const run: SpecRun = {
    id: runId,
    changeId,
    status: 'pending',
    currentStageId: null,
    currentTaskId: null,
    activeTaskCount: 0,
    engineHealthSummary: 'Draft created and waiting for planning.',
    watchdogStatus: 'healthy',
    createdAt: now,
    updatedAt: now,
  };

  return refreshDerivedSpecState({
    schemaVersion: 1,
    mode: 'spec',
    change: {
      id: changeId,
      slug: input.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'change',
      title: input.title,
      status: 'draft',
      goal: input.goal,
      overview: input.overview || '',
      scope: [],
      nonGoals: [],
      constraints: input.constraints || [],
      risks: [],
      successCriteria: input.successCriteria || [],
      affectedAreas: [],
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
    runs: [run],
    metrics: {
      tasks: { total: 0, completed: 0, running: 0, blocked: 0, waitingReview: 0, waitingHuman: 0, currentTaskTitle: null },
      artifacts: { accepted: 0, draft: 0, rejected: 0 },
    },
    execution: {
      activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.planner,
      maintenanceLeaseOwnerId: null,
    },
    createdAt: now,
    updatedAt: now,
  }, now);
}

export function reduceStartSpecRun(state: SpecState, eventTime = Date.now()) {
  const tasks = ensurePlanningTask(state, eventTime);
  const currentTask = tasks.find((task) => task.status === 'running') || tasks.find((task) => task.status === 'ready') || tasks[0] || null;
  const nextTaskStatus: SpecTaskStatus | undefined = currentTask && currentTask.status === 'ready' ? 'running' : currentTask?.status;

  const nextState = refreshDerivedSpecState({
    ...state,
    change: {
      ...state.change,
      status: 'running',
      currentTaskId: currentTask?.id || null,
      updatedAt: eventTime,
    },
    tasks: tasks.map((task) => task.id === currentTask?.id && nextTaskStatus === 'running'
      ? { ...task, status: 'running', updatedAt: eventTime }
      : task),
    runs: state.runs.map((run, index) => index === state.runs.length - 1
      ? {
          ...run,
          status: 'running',
          currentTaskId: currentTask?.id || null,
          activeTaskCount: currentTask ? 1 : 0,
          engineHealthSummary: currentTask ? `Running ${currentTask.title}.` : 'Run started.',
          lastWakeAt: eventTime,
          lastWakeReason: 'start',
          updatedAt: eventTime,
        }
      : run),
    execution: {
      ...state.execution,
      activeAgentProfileId: currentTask?.assignedAgentProfileId || SPEC_AGENT_PROFILE_IDS.orchestrator,
    },
  }, eventTime);

  return {
    state: nextState,
    event: createTimelineEvent(nextState, 'run.started', 'Run started', 'Spec execution entered live mode.', currentTask?.id),
  };
}

export function reducePauseSpecRun(state: SpecState, reason = 'Run paused by the user.', eventTime = Date.now()) {
  const nextState = refreshDerivedSpecState({
    ...state,
    change: {
      ...state.change,
      status: 'paused',
      updatedAt: eventTime,
    },
    runs: state.runs.map((run, index) => index === state.runs.length - 1
      ? {
          ...run,
          status: 'paused',
          engineHealthSummary: reason,
          watchdogStatus: 'paused',
          updatedAt: eventTime,
        }
      : run),
    execution: {
      ...state.execution,
      activeAgentProfileId: null,
    },
  }, eventTime);

  return {
    state: nextState,
    event: createTimelineEvent(nextState, 'run.paused', 'Run paused', reason),
  };
}

export function reduceResumeSpecRun(state: SpecState, eventTime = Date.now()) {
  const nextState = refreshDerivedSpecState({
    ...state,
    change: {
      ...state.change,
      status: 'running',
      updatedAt: eventTime,
    },
    tasks: state.tasks.map((task) => task.status === 'paused' || task.status === 'blocked'
      ? { ...task, status: 'ready', updatedAt: eventTime }
      : task),
    runs: state.runs.map((run, index) => index === state.runs.length - 1
      ? {
          ...run,
          status: 'running',
          engineHealthSummary: 'Run resumed.',
          pendingHumanAction: undefined,
          watchdogStatus: 'healthy',
          updatedAt: eventTime,
        }
      : run),
    execution: {
      ...state.execution,
      activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.orchestrator,
    },
  }, eventTime);

  return {
    state: nextState,
    event: createTimelineEvent(nextState, 'run.resumed', 'Run resumed', 'Spec execution resumed.'),
  };
}

export function reduceApproveHumanTask(state: SpecState, taskId?: string, summary = 'Human gate approved.', eventTime = Date.now()) {
  const latestRun = state.runs[state.runs.length - 1] || null;
  const pendingTaskId = taskId || latestRun?.pendingHumanAction?.taskId;
  if (!pendingTaskId) {
    return { state, event: null as SpecTimelineEvent | null };
  }

  const task = state.tasks.find((item) => item.id === pendingTaskId) || null;
  const nextState = refreshDerivedSpecState({
    ...state,
    change: {
      ...state.change,
      status: 'running',
      updatedAt: eventTime,
    },
    tasks: state.tasks.map((item) => item.id === pendingTaskId
      ? {
          ...item,
          status: item.kind === 'checkpoint' ? 'completed' : 'ready',
          blockedReason: undefined,
          updatedAt: eventTime,
        }
      : item),
    runs: state.runs.map((run, index) => index === state.runs.length - 1
      ? {
          ...run,
          status: 'running',
          pendingHumanAction: undefined,
          failureState: run.failureState?.taskId === pendingTaskId ? undefined : run.failureState,
          engineHealthSummary: summary,
          updatedAt: eventTime,
        }
      : run),
    execution: {
      ...state.execution,
      activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.orchestrator,
    },
  }, eventTime);

  return {
    state: nextState,
    event: createTimelineEvent(nextState, 'task.updated', 'Human gate approved', `Human approval cleared ${task?.title || 'the blocked task'}.`, pendingTaskId),
  };
}

export function reduceRetrySpecTask(state: SpecState, taskId?: string, summary = 'Task retry requested.', eventTime = Date.now()) {
  const latestRun = state.runs[state.runs.length - 1] || null;
  const retryTaskId = taskId || latestRun?.failureState?.taskId || state.tasks.find((task) => task.status === 'failed' || task.status === 'blocked')?.id;
  if (!retryTaskId) {
    return { state, event: null as SpecTimelineEvent | null };
  }

  const nextState = refreshDerivedSpecState({
    ...state,
    change: {
      ...state.change,
      status: 'running',
      updatedAt: eventTime,
    },
    tasks: state.tasks.map((task) => task.id === retryTaskId
      ? {
          ...task,
          status: 'ready',
          blockedReason: undefined,
          updatedAt: eventTime,
        }
      : task),
    runs: state.runs.map((run, index) => index === state.runs.length - 1
      ? {
          ...run,
          status: 'running',
          failureState: run.failureState?.taskId === retryTaskId ? undefined : run.failureState,
          pendingHumanAction: run.pendingHumanAction?.taskId === retryTaskId ? undefined : run.pendingHumanAction,
          engineHealthSummary: summary,
          updatedAt: eventTime,
        }
      : run),
    execution: {
      ...state.execution,
      activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.orchestrator,
    },
  }, eventTime);

  return {
    state: nextState,
    event: createTimelineEvent(nextState, 'task.updated', 'Task retried', 'The failed task was marked ready for retry.', retryTaskId),
  };
}

export function canResumeSpecFromUi(state: SpecState) {
  const latestRun = state.runs[state.runs.length - 1] || null;
  return state.change.status === 'paused' || latestRun?.status === 'paused';
}

export function canStartSpecFromUi(state: SpecState) {
  return ['draft', 'planned', 'ready', 'paused'].includes(state.change.status);
}
