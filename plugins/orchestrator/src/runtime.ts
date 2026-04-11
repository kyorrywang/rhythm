import type { PluginContext } from '../../../src/plugin/sdk';
import type { StreamRuntime } from '../../../src/shared/types/schema';
import { useSessionStore } from '../../../src/shared/state/useSessionStore';
import { interruptAgentSession, isAgentSessionActive, launchAgentSession } from './agentSessionRuntime';
import { ORCHESTRATOR_EVENTS } from './constants';
import {
  appendControlIntent,
  appendRunEvent,
  getAgentRunByTaskId,
  getProjectState,
  getReviewPolicy,
  getRun,
  getTask,
  listAgentRunsForRun,
  listArtifactsForRun,
  listCoordinatorRunsForRun,
  listReviewLogsForRun,
  saveReviewLog,
  listTasksForRun,
  saveAgentRun,
  saveArtifact,
  saveCoordinatorRun,
  saveProjectState,
  saveRun,
  saveTask,
  updateAgentRun,
  updateArtifact,
  updateCoordinatorRun,
  updateTask,
} from './storage';
import type {
  AssignmentBrief,
  OrchestratorAgentRun,
  OrchestratorAgentTask,
  OrchestratorArtifact,
  OrchestratorCancelRunInput,
  OrchestratorCompleteTaskInput,
  OrchestratorConfirmedPlan,
  OrchestratorOverrideReviewInput,
  OrchestratorPauseRunInput,
  OrchestratorPlanStage,
  OrchestratorProjectState,
  OrchestratorCoordinatorRun,
  OrchestratorResumeRunInput,
  OrchestratorRetryTaskInput,
  OrchestratorReviewLog,
  OrchestratorRun,
  OrchestratorSkipTaskInput,
  OrchestratorUpdateTaskInput,
  OrchestratorWakeRunInput,
  OrchestratorFailureKind,
  OrchestrationContext,
  OrchestrationDecisionRecord,
  OrchestrationDecision,
  OrchestrationInputSnapshot,
  ReviewAgentOutputSnapshot,
} from './types';
import { createId } from './utils';

const MAX_WATCHDOG_IDLE_MS = 5 * 60 * 1000;
const MAX_TRANSIENT_AGENT_RETRIES = 2;
const MAX_REWORK_ATTEMPTS = 2;
const AUTO_RETRY_DELAY_MS = 10_000;
const ORCHESTRATOR_WORK_AGENT_ALLOWED_TOOLS = ['read', 'write', 'edit'];
const ORCHESTRATOR_REVIEW_AGENT_ALLOWED_TOOLS = ['read'];
const ORCHESTRATOR_COORDINATOR_ALLOWED_TOOLS: string[] = [];
const RUN_STATUS_TRANSITIONS: Record<OrchestratorRun['status'], OrchestratorRun['status'][]> = {
  pending: ['running', 'cancelled', 'failed'],
  running: ['waiting_review', 'waiting_human', 'pause_requested', 'paused', 'completed', 'failed', 'cancelled'],
  waiting_review: ['running', 'waiting_human', 'paused', 'completed', 'failed', 'cancelled'],
  waiting_human: ['running', 'paused', 'failed', 'cancelled'],
  pause_requested: ['paused', 'running', 'cancelled'],
  paused: ['running', 'cancelled', 'failed'],
  completed: [],
  failed: ['paused', 'running', 'cancelled'],
  cancelled: [],
  interrupted: ['paused', 'failed', 'cancelled'],
};
const TASK_STATUS_TRANSITIONS: Record<OrchestratorAgentTask['status'], OrchestratorAgentTask['status'][]> = {
  pending: ['ready', 'cancelled', 'blocked'],
  ready: ['running', 'waiting_human', 'blocked', 'cancelled', 'failed', 'completed'],
  running: ['waiting_review', 'waiting_human', 'paused', 'completed', 'failed', 'cancelled', 'blocked'],
  blocked: ['ready', 'waiting_human', 'cancelled', 'failed'],
  waiting_review: ['running', 'waiting_human', 'completed', 'cancelled', 'failed'],
  waiting_human: ['ready', 'running', 'cancelled', 'failed'],
  paused: ['ready', 'running', 'cancelled', 'failed'],
  completed: [],
  failed: ['ready', 'cancelled'],
  cancelled: [],
  interrupted: ['paused', 'failed', 'cancelled'],
};
const pendingAutomaticRetries = new Map<string, number>();
const pendingAutomaticRunResumes = new Map<string, number>();

type Dispatch = {
  parentTask: OrchestratorAgentTask;
  stage: OrchestratorPlanStage;
  kind: 'work' | 'review';
  agentId: string;
  agentName: string;
  goal: string;
  assignmentBrief?: AssignmentBrief;
};

function canTransitionRunStatus(from: OrchestratorRun['status'], to: OrchestratorRun['status']) {
  return from === to || RUN_STATUS_TRANSITIONS[from]?.includes(to);
}

function canTransitionTaskStatus(from: OrchestratorAgentTask['status'], to: OrchestratorAgentTask['status']) {
  return from === to || TASK_STATUS_TRANSITIONS[from]?.includes(to);
}

function assertRunStatusTransition(from: OrchestratorRun['status'], to: OrchestratorRun['status']) {
  if (!canTransitionRunStatus(from, to)) {
    throw new Error(`Illegal run status transition: ${from} -> ${to}`);
  }
}

function assertTaskStatusTransition(from: OrchestratorAgentTask['status'], to: OrchestratorAgentTask['status']) {
  if (!canTransitionTaskStatus(from, to)) {
    throw new Error(`Illegal task status transition: ${from} -> ${to}`);
  }
}

function clearAutomaticRetry(taskId: string) {
  const timer = pendingAutomaticRetries.get(taskId);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    pendingAutomaticRetries.delete(taskId);
  }
}

function scheduleAutomaticRetry(
  ctx: PluginContext,
  runId: string,
  taskId: string,
  autoRetryAt: number,
) {
  clearAutomaticRetry(taskId);
  const delayMs = Math.max(0, autoRetryAt - Date.now());
  const timer = window.setTimeout(() => {
    pendingAutomaticRetries.delete(taskId);
    void retryOrchestratorTask(ctx, { taskId }).catch(() => {});
  }, delayMs);
  pendingAutomaticRetries.set(taskId, timer);
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId });
}

function clearAutomaticRunResume(runId: string) {
  const timer = pendingAutomaticRunResumes.get(runId);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    pendingAutomaticRunResumes.delete(runId);
  }
}

function scheduleAutomaticRunResume(
  ctx: PluginContext,
  runId: string,
  autoRetryAt: number,
) {
  clearAutomaticRunResume(runId);
  const delayMs = Math.max(0, autoRetryAt - Date.now());
  const timer = window.setTimeout(() => {
    pendingAutomaticRunResumes.delete(runId);
    void resumeOrchestratorRun(ctx, { runId }).catch(() => {});
  }, delayMs);
  pendingAutomaticRunResumes.set(runId, timer);
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId });
}

type AutomaticRecoveryTarget =
  | {
    kind: 'task';
    task: OrchestratorAgentTask;
    retryAgentRunId: string;
  }
  | {
    kind: 'coordinator';
    coordinatorRun: OrchestratorCoordinatorRun;
  };

async function scheduleTransientFailureRecovery(
  ctx: PluginContext,
  run: OrchestratorRun,
  target: AutomaticRecoveryTarget,
  message: string,
  now: number,
) {
  const retryCount = getAutomaticRecoveryRetryCount(run, target);
  if (!shouldAutoRecoverTransientFailure(message, retryCount)) {
    return false;
  }

  const autoRetryAt = now + AUTO_RETRY_DELAY_MS;
  const subject =
    target.kind === 'task'
      ? target.task.agentName || target.task.title
      : 'Orchestrator agent';
  const summary =
    target.kind === 'task'
      ? `${subject} hit a transient LLM transport failure and will retry automatically.`
      : 'Orchestrator agent hit a transient failure and will retry automatically.';
  const engineHealth =
    target.kind === 'task'
      ? `Retrying ${subject} automatically in ${Math.round(AUTO_RETRY_DELAY_MS / 1000)} seconds after a transient failure.`
      : `Retrying orchestrator automatically in ${Math.round(AUTO_RETRY_DELAY_MS / 1000)} seconds after a transient failure.`;
  const eventTitle =
    target.kind === 'task'
      ? 'Task auto-retry scheduled'
      : 'Orchestrator auto-retry scheduled';
  const eventDetail =
    target.kind === 'task'
      ? `${subject} hit a transient error and will retry automatically in ${Math.round(AUTO_RETRY_DELAY_MS / 1000)} seconds: ${message}`
      : `Orchestrator agent hit a transient error and will retry automatically in ${Math.round(AUTO_RETRY_DELAY_MS / 1000)} seconds: ${message}`;

  await saveRun(ctx, {
    ...run,
    status: target.kind === 'task' ? 'running' : 'paused',
    pausedAt: target.kind === 'task' ? undefined : now,
    pauseRequestedAt: target.kind === 'task' ? undefined : run.pauseRequestedAt,
    failureState: buildRunFailureState(run, {
      kind: 'agent_runtime_error',
      summary: message,
      retryable: true,
      requiresHuman: false,
      recommendedAction: `Automatic retry scheduled in ${Math.round(AUTO_RETRY_DELAY_MS / 1000)} seconds.`,
      autoRetryAt,
      taskId: target.kind === 'task' ? target.task.id : undefined,
      agentRunId: target.kind === 'task' ? target.retryAgentRunId : target.coordinatorRun.id,
    }, now),
    activeTaskCount:
      target.kind === 'task'
        ? Math.max(1, run.activeTaskCount)
        : Math.max(0, run.activeTaskCount - 1),
    lastDecisionAt: now,
    lastDecisionSummary: summary,
    engineHealthSummary: engineHealth,
    updatedAt: now,
  });
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: target.kind === 'task' ? 'task.updated' : 'run.updated',
    title: eventTitle,
    detail: eventDetail,
    createdAt: now,
  });

  if (target.kind === 'task') {
    scheduleAutomaticRetry(ctx, run.id, target.task.id, autoRetryAt);
  } else {
    scheduleAutomaticRunResume(ctx, run.id, autoRetryAt);
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
  return true;
}

function shouldAutoRecoverTransientFailure(message: string, retryCount: number) {
  return isTransientAgentFailure(message) && retryCount < MAX_TRANSIENT_AGENT_RETRIES;
}

function getAutomaticRecoveryRetryCount(run: OrchestratorRun, target: AutomaticRecoveryTarget) {
  if (!run.failureState?.retryable) {
    return 0;
  }
  if (target.kind === 'task') {
    return run.failureState.taskId === target.task.id ? run.failureState.retryCount || 0 : 0;
  }
  return run.failureState.agentRunId === target.coordinatorRun.id ? run.failureState.retryCount || 0 : 0;
}

function isRetryRuntime(runtime?: StreamRuntime | null) {
  return runtime?.state === 'backoff_waiting' || runtime?.state === 'retrying';
}

async function syncRunRuntimeFromAgent(
  ctx: PluginContext,
  runId: string,
  runtime?: StreamRuntime | null,
  options?: { taskId?: string; agentRunId?: string; label: string },
) {
  const run = await getRun(ctx, runId);
  if (!run || !runtime) return;
  const now = Date.now();

  if (isRetryRuntime(runtime)) {
    await saveRun(ctx, {
      ...run,
      status: options?.taskId ? 'running' : 'paused',
      pausedAt: options?.taskId ? undefined : now,
      failureState: buildRunFailureState(run, {
        kind: 'agent_runtime_error',
        summary: runtime.message || `${options?.label || 'Agent'} is retrying automatically.`,
        retryable: true,
        requiresHuman: false,
        recommendedAction: runtime.retryInSeconds
          ? `Automatic retry scheduled in ${runtime.retryInSeconds} seconds.`
          : 'Automatic retry in progress.',
        autoRetryAt: runtime.retryAt,
        taskId: options?.taskId,
        agentRunId: options?.agentRunId,
        runtime,
      }, now),
      engineHealthSummary: runtime.message || `${options?.label || 'Agent'} is retrying automatically.`,
      updatedAt: now,
    });
    ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId });
    return;
  }

  if (run.failureState && !run.failureState.requiresHuman && run.failureState.retryable) {
    await saveRun(ctx, {
      ...run,
      failureState: undefined,
      engineHealthSummary: runtime.message || run.engineHealthSummary,
      pausedAt: run.status === 'paused' ? undefined : run.pausedAt,
      status: run.status === 'paused' ? 'running' : run.status,
      updatedAt: now,
    });
    ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId });
  }
}

export async function startOrchestratorRun(
  ctx: PluginContext,
  run: OrchestratorRun,
) {
  const startedAt = Date.now();
  assertRunStatusTransition(run.status, 'running');
  const nextRun: OrchestratorRun = {
    ...run,
    status: 'running',
    failureState: undefined,
    lastWakeAt: startedAt,
    updatedAt: startedAt,
  };

  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: nextRun.id,
    type: 'run.started',
    title: 'Run started',
    detail: `Main agent entered ${nextRun.currentStageName || 'the first stage'}.`,
    createdAt: startedAt,
  });

  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  return wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'start' });
}

export async function wakeOrchestratorRun(
  ctx: PluginContext,
  run: OrchestratorRun,
  input: OrchestratorWakeRunInput,
) {
  const wakeAt = Date.now();
  if (run.status === 'pause_requested' || run.status === 'paused' || run.status === 'waiting_human' || run.status === 'cancelled') {
    return run;
  }

  let tasks = await listTasksForRun(ctx, run.id);
  if (tasks.length === 0) {
    await seedPlanTasks(ctx, run, wakeAt);
    tasks = await listTasksForRun(ctx, run.id);
  }
  const reviewLogs = await listReviewLogsForRun(ctx, run.id);
  const projectState = await getProjectState(ctx, run.id);
  const artifacts = await listArtifactsForRun(ctx, run.id);
  const reviewPolicy = await getReviewPolicy(ctx, run.id);
  const activeTaskCount = tasks.filter((task) => isLiveTask(task)).length;
  const availableSlots = Math.max(0, (run.maxConcurrentTasks || 2) - activeTaskCount);
  const dispatchPlan = buildDispatchCandidates(run.confirmedPlan, tasks);
  const orchestrationContext: OrchestrationContext = {
    run,
    wakeReason: input.reason,
    tasks,
    reviewLogs,
    projectState,
    artifacts,
    activeTaskCount,
    availableSlots,
  };
  const orchestrationInput = buildOrchestrationInput(orchestrationContext, dispatchPlan.candidates, reviewPolicy);
  const orchestrationPrompt = buildOrchestrationPrompt(orchestrationInput);
  const coordinatorRun: OrchestratorCoordinatorRun = {
    id: createId('orchestrator_run'),
    runId: run.id,
    sessionId: `orchestrator-main-${run.id}-${wakeAt}`,
    title: `${run.planTitle} Orchestrator Agent`,
    prompt: orchestrationPrompt,
    wakeReason: input.reason,
    input: orchestrationInput,
    status: 'pending',
    createdAt: wakeAt,
    updatedAt: wakeAt,
  };
  const wokeRun: OrchestratorRun = {
    ...run,
    status: run.status === 'pending' ? 'running' : run.status,
    failureState: undefined,
    watchdogStatus: 'healthy',
    watchdogWarning: undefined,
    watchdogCheckedAt: wakeAt,
    lastWakeAt: wakeAt,
    lastWakeReason: input.reason || 'system',
    currentOrchestratorAgentRunId: coordinatorRun.id,
    lastOrchestratorAgentRunId: coordinatorRun.id,
    orchestrationInput,
    orchestrationPrompt,
    orchestrationDecision: undefined,
    updatedAt: wakeAt,
  };

  await Promise.all([
    saveRun(ctx, wokeRun),
    saveCoordinatorRun(ctx, coordinatorRun),
  ]);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'agent.wake',
    title: 'Orchestrator agent woke up',
    detail: `Reason: ${input.reason || 'system'}`,
    createdAt: wakeAt,
  });
  const runningWithCoordinator: OrchestratorRun = {
    ...wokeRun,
    activeTaskCount: activeTaskCount + 1,
    engineHealthSummary: 'Orchestrator agent is evaluating the next step.',
    updatedAt: wakeAt,
  };
  await saveRun(ctx, runningWithCoordinator);
  void startCoordinatorRunSession(ctx, runningWithCoordinator, coordinatorRun, dispatchPlan.candidates);
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: runningWithCoordinator.id });
  return runningWithCoordinator;
}

export async function wakeRunById(ctx: PluginContext, input: OrchestratorWakeRunInput) {
  const run = await getRun(ctx, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  return wakeOrchestratorRun(ctx, run, input);
}

export async function pauseOrchestratorRun(ctx: PluginContext, input: OrchestratorPauseRunInput) {
  const run = await getRun(ctx, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status === 'paused' || run.status === 'completed' || run.status === 'cancelled') {
    return run;
  }

  const now = Date.now();
  const nextRun: OrchestratorRun = {
    ...run,
    status: run.activeTaskCount > 0 ? 'pause_requested' : 'paused',
    engineHealthSummary: run.activeTaskCount > 0
      ? `Pause requested while ${run.activeTaskCount} task(s) finish safely.`
      : 'Run paused by a human operator.',
    lastHumanInterventionAt: now,
    lastHumanInterventionSummary: 'Paused the run.',
    pauseRequestedAt: now,
    pausedAt: run.activeTaskCount > 0 ? run.pausedAt : now,
    updatedAt: now,
  };

  await saveRun(ctx, nextRun);
  await appendControlIntent(ctx, { runId: run.id, action: 'pause', createdAt: now });
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: run.activeTaskCount > 0 ? 'run.pause_requested' : 'run.paused',
    title: run.activeTaskCount > 0 ? 'Pause requested' : 'Run paused',
    detail: run.activeTaskCount > 0
      ? `Waiting for ${run.activeTaskCount} active task(s) to finish.`
      : 'No active tasks. Run paused immediately.',
    createdAt: now,
  });
  if (run.currentOrchestratorAgentRunId) {
    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);
    const coordinatorRun = coordinatorRuns.find((item) => item.id === run.currentOrchestratorAgentRunId);
    if (coordinatorRun?.sessionId && isAgentSessionActive(coordinatorRun.sessionId)) {
      await interruptAgentSession(coordinatorRun.sessionId);
    }
  }
  if (run.activeTaskCount > 0) {
    const tasks = await listTasksForRun(ctx, run.id);
    await Promise.all(
      tasks
        .filter((task) => isActiveTask(task) && task.sessionId)
        .map((task) => interruptAgentSession(task.sessionId!)),
    );
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  return nextRun;
}

export async function resumeOrchestratorRun(ctx: PluginContext, input: OrchestratorResumeRunInput) {
  const run = await getRun(ctx, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status !== 'paused' && run.status !== 'waiting_human') {
    throw new Error(`Run is not paused: ${input.runId}`);
  }

  const resumedAt = Date.now();
  if (run.failureState && !run.failureState.retryable && run.status !== 'waiting_human') {
    throw new Error(`Run cannot be resumed automatically from non-retryable failure: ${run.failureState.kind}`);
  }
  assertRunStatusTransition(run.status, 'running');
  const resumedRun: OrchestratorRun = {
    ...run,
    status: 'running',
    failureState: undefined,
    engineHealthSummary: 'Run resumed and waiting for the orchestrator agent to continue.',
    lastHumanInterventionAt: resumedAt,
    lastHumanInterventionSummary: 'Resumed the run.',
    pausedAt: undefined,
    pauseRequestedAt: undefined,
    updatedAt: resumedAt,
  };

  await saveRun(ctx, resumedRun);
  await appendControlIntent(ctx, { runId: run.id, action: 'resume', createdAt: resumedAt });
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'run.resumed',
    title: 'Run resumed',
    detail: 'Main agent will be awakened again.',
    createdAt: resumedAt,
  });
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: resumedRun.id });
  return wakeOrchestratorRun(ctx, resumedRun, { runId: resumedRun.id, reason: 'resume' });
}

export async function completeOrchestratorTask(ctx: PluginContext, input: OrchestratorCompleteTaskInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.status === 'completed') {
    const run = await getRun(ctx, task.runId);
    return { run, task };
  }

  const now = Date.now();
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  const artifactContent = agentRun ? getAgentRunArtifactContent(agentRun.sessionId) : '';
  if (agentRun && containsToolCallMarkup(artifactContent)) {
    return failOrchestratorTask(ctx, task.id, new Error('Agent output still contains raw tool-call markup and no valid final result.'));
  }
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...(assertTaskStatusTransition(current.status, 'completed'), current),
    status: 'completed',
    updatedAt: now,
  }));
  if (agentRun) {
    await updateAgentRun(ctx, agentRun.id, (current) => ({
      ...current,
      status: 'completed',
      completedAt: current.completedAt || now,
      lastEventAt: now,
      updatedAt: now,
    }));
    const existingArtifacts = await listArtifactsForRun(ctx, task.runId);
    const existingOutputArtifacts = existingArtifacts.filter((artifact) => artifact.agentRunId === agentRun.id);
    const expectedFilePaths = buildExpectedFilePaths(agentRun.input.assignmentBrief);
    if ((artifactContent || expectedFilePaths.length > 0) && existingOutputArtifacts.length === 0) {
      await saveArtifact(ctx, {
        id: createId('artifact'),
        runId: task.runId,
        agentRunId: agentRun.id,
        taskId: task.id,
        stageId: task.stageId,
        stageName: task.stageName,
        agentId: task.agentId,
        agentName: task.agentName,
        name: `${task.agentName || task.title} Output`,
        logicalKey: buildArtifactLogicalKey(task),
        status: 'draft',
        version: task.attemptCount || 1,
        kind: guessArtifactKind(task),
        format: 'markdown',
        filePaths: expectedFilePaths,
        summary: buildArtifactSummary(task, artifactContent, expectedFilePaths),
        content: artifactContent,
        createdAt: now,
        updatedAt: now,
      });
    }
    const runArtifacts = await listArtifactsForRun(ctx, task.runId);
    const outputArtifacts = runArtifacts.filter((artifact) => artifact.agentRunId === agentRun.id);
    await updateTask(ctx, task.id, (current) => ({
      ...current,
      latestArtifactIds: outputArtifacts.map((artifact) => artifact.id),
      updatedAt: now,
    }));
    await updateAgentRun(ctx, agentRun.id, (current) => ({
      ...current,
      output: {
        summary: outputArtifacts[0]?.summary || buildArtifactSummary(task, artifactContent || ''),
        artifactIds: outputArtifacts.map((artifact) => artifact.id),
        artifactSummaries: outputArtifacts.map((artifact) => artifact.summary),
        completedAt: now,
      },
      updatedAt: now,
    }));
  }
  const run = await getRun(ctx, task.runId);
  if (!run || !nextTask) return { run, task: nextTask };

  let nextStatus = run.status;
  const nextActiveTaskCount = Math.max(0, run.activeTaskCount - 1);
  if (run.status === 'pause_requested' && nextActiveTaskCount === 0) {
    nextStatus = 'paused';
  }

  let nextRun: OrchestratorRun = {
    ...run,
    activeTaskCount: nextActiveTaskCount,
    status: nextStatus,
    failureState: nextStatus === 'paused' ? run.failureState : undefined,
    engineHealthSummary: nextStatus === 'paused'
      ? 'Run is paused and waiting for human action.'
      : nextActiveTaskCount > 0
        ? `Run is waiting on ${nextActiveTaskCount} active task(s).`
        : 'Run is ready for the orchestrator agent to continue.',
    pausedAt: nextStatus === 'paused' ? now : run.pausedAt,
    updatedAt: now,
  };

  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'task.updated',
    title: 'Task completed',
    detail: `${task.agentName || task.title} completed.`,
    createdAt: now,
  });

  if (task.parentTaskId) {
    if (task.kind === 'review') {
      const reviewContent = agentRun ? getAgentRunArtifactContent(agentRun.sessionId) : '';
      const reviewedArtifacts = await listReviewedArtifacts(ctx, task.runId, task.parentTaskId);
      const reviewResult = parseReviewDecision(reviewContent, reviewedArtifacts.length);
      const reviewLog: OrchestratorReviewLog = {
        id: createId('review'),
        runId: task.runId,
        stageId: task.stageId,
        stageName: task.stageName,
        taskId: task.id,
        parentTaskId: task.parentTaskId,
        agentRunId: agentRun?.id,
        reviewerName: task.agentName,
        decision: reviewResult.decision,
        summary: reviewResult.summary,
        feedback: reviewContent || reviewResult.summary,
        source: 'agent',
        reviewedArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
        createdAt: now,
        updatedAt: now,
      };
      await saveReviewLog(ctx, reviewLog);
      await updateTask(ctx, task.parentTaskId, (current) => ({
        ...current,
        latestReviewLogId: reviewLog.id,
        updatedAt: now,
      }));
      await updateTask(ctx, task.id, (current) => ({
        ...current,
        latestReviewLogId: reviewLog.id,
        latestArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
        updatedAt: now,
      }));
      if (agentRun) {
        await updateAgentRun(ctx, agentRun.id, (current) => ({
          ...current,
          output: {
            decision: reviewResult.decision,
            summary: reviewResult.summary,
            feedback: reviewContent || reviewResult.summary,
            reviewedArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
            completedAt: now,
            source: 'agent',
          } satisfies ReviewAgentOutputSnapshot,
          updatedAt: now,
        }));
      }
      const parentTask = await getTask(ctx, task.parentTaskId);
      if (reviewResult.decision === 'approved') {
        await acceptStageArtifacts(ctx, task.runId, task.parentTaskId, reviewLog.id, now);
        const completedParent = await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now);
        if (completedParent) {
          await unlockNextPendingStageContainer(ctx, task.runId, completedParent, now);
        }
      } else if (reviewResult.decision === 'needs_changes') {
        await rejectReviewedArtifacts(ctx, reviewedArtifacts.map((artifact) => artifact.id), now);
        const reworkCount = await countReworkTasksForParent(ctx, task.runId, task.parentTaskId);
        if (reworkCount >= MAX_REWORK_ATTEMPTS) {
          await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now, reviewResult.summary, true);
          nextStatus = 'failed';
          nextRun = {
            ...nextRun,
            status: 'failed',
            pendingHumanCheckpoint: reviewResult.summary,
            pausedAt: now,
            failureState: buildRunFailureState(nextRun, {
              kind: 'non_converging_rework',
              summary: reviewResult.summary,
              retryable: false,
              requiresHuman: true,
              recommendedAction: 'Rework has failed to converge. Inspect the stage manually before resuming.',
              taskId: task.parentTaskId,
              agentRunId: agentRun?.id,
            }, now),
            updatedAt: now,
          };
          await saveRun(ctx, nextRun);
        } else if (parentTask) {
          await createReworkTaskFromReview(ctx, nextRun, parentTask, reviewedArtifacts, reviewResult.summary, now);
          await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now, reviewResult.summary, true);
          nextStatus = 'waiting_human';
          nextRun = {
            ...nextRun,
            status: 'waiting_human',
            pendingHumanCheckpoint: reviewResult.summary,
            pausedAt: now,
            failureState: buildRunFailureState(nextRun, {
              kind: 'human_required',
              summary: reviewResult.summary,
              retryable: true,
              requiresHuman: true,
              recommendedAction: 'Review the feedback, approve the rework task, then resume the run.',
              taskId: task.parentTaskId,
              agentRunId: agentRun?.id,
            }, now),
            updatedAt: now,
          };
          await saveRun(ctx, nextRun);
        }
      } else {
        await rejectReviewedArtifacts(ctx, reviewedArtifacts.map((artifact) => artifact.id), now);
        await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now, reviewResult.summary, true);
        nextStatus = 'failed';
        nextRun = {
          ...nextRun,
          status: 'failed',
          pendingHumanCheckpoint: reviewResult.summary,
          pausedAt: now,
          failureState: buildRunFailureState(nextRun, {
            kind: 'review_deadlock',
            summary: reviewResult.summary,
            retryable: false,
            requiresHuman: true,
            recommendedAction: 'Inspect the rejected stage manually before deciding whether to resume or replace this stage.',
            taskId: task.parentTaskId,
            agentRunId: agentRun?.id,
          }, now),
          updatedAt: now,
        };
        await saveRun(ctx, nextRun);
      }
    } else if (task.kind === 'work') {
      await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now);
    }
  }

  if (run.status === 'pause_requested' && nextActiveTaskCount === 0) {
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'run.paused',
      title: 'Run paused',
      detail: 'All active tasks finished. Pause is now effective.',
      createdAt: now,
    });
  }

  if (task.kind === 'review' && nextStatus === 'waiting_human') {
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'run.updated',
      title: 'Review requires human follow-up',
      detail: `${task.agentName || task.title} did not approve this stage. The run is waiting for human action before rework continues.`,
      createdAt: now,
    });
  }

  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  const derivedNextRun = await deriveRunStatusFromTasks(ctx, nextRun);
  if (derivedNextRun.status !== nextRun.status || derivedNextRun.pendingHumanCheckpoint !== nextRun.pendingHumanCheckpoint) {
    nextRun = derivedNextRun;
    await saveRun(ctx, nextRun);
  }
  if ((nextRun.status === 'running' || nextRun.status === 'waiting_review') && nextRun.activeTaskCount === 0) {
    const awakened = await wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'task_completed' });
    return { run: awakened, task: nextTask };
  }
  return { run: nextRun, task: nextTask };
}

export async function updateOrchestratorTask(ctx: PluginContext, input: OrchestratorUpdateTaskInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  const now = Date.now();
  const trimmedSummary = input.summary?.trim();
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...current,
    summary: trimmedSummary || current.summary,
    updatedAt: now,
  }));
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  if (agentRun && trimmedSummary) {
    await updateAgentRun(ctx, agentRun.id, (current) => ({
      ...current,
      prompt: rewriteAgentPrompt(current.prompt, trimmedSummary),
      updatedAt: now,
    }));
  }
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: task.runId,
    type: 'task.updated',
    title: 'Task updated by human',
    detail: trimmedSummary
      ? `${task.agentName || task.title} received an updated instruction.`
      : `${task.agentName || task.title} was reviewed by a human.`,
    createdAt: now,
  });
  const run = await getRun(ctx, task.runId);
  if (run) {
    await saveRun(ctx, {
      ...run,
      lastHumanInterventionAt: now,
      lastHumanInterventionSummary: trimmedSummary
        ? `Updated task ${task.agentName || task.title}.`
        : `Reviewed task ${task.agentName || task.title}.`,
      updatedAt: now,
    });
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: task.runId });
  return {
    task: nextTask,
    agentRun: agentRun ? await getAgentRunByTaskId(ctx, task.id) : null,
  };
}

export async function overrideReviewDecision(ctx: PluginContext, input: OrchestratorOverrideReviewInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.kind !== 'review' || !task.parentTaskId) {
    throw new Error(`Task is not a review task: ${input.taskId}`);
  }
  const run = await getRun(ctx, task.runId);
  if (!run) throw new Error(`Run not found: ${task.runId}`);
  const reviewAgentRun = await getAgentRunByTaskId(ctx, task.id);
  const now = Date.now();
  const reviewedArtifacts = await listReviewedArtifacts(ctx, task.runId, task.parentTaskId);
  const feedback = input.feedback?.trim() || buildHumanOverrideFeedback(input.decision, task);

  const reviewLog: OrchestratorReviewLog = {
    id: createId('review'),
    runId: task.runId,
    stageId: task.stageId,
    stageName: task.stageName,
    taskId: task.id,
    parentTaskId: task.parentTaskId,
    agentRunId: reviewAgentRun?.id,
    reviewerName: 'Human Reviewer',
    decision: input.decision,
    summary: summarizeReviewDecision(input.decision, true),
    feedback,
    source: 'human_override',
    overrideReason: feedback,
    overriddenAgentRunId: reviewAgentRun?.id,
    reviewedArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
    createdAt: now,
    updatedAt: now,
  };
  await saveReviewLog(ctx, reviewLog);
  await updateTask(ctx, task.parentTaskId, (current) => ({
    ...current,
    latestReviewLogId: reviewLog.id,
    updatedAt: now,
  }));
  await updateTask(ctx, task.id, (current) => ({
    ...current,
    latestReviewLogId: reviewLog.id,
    latestArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
    updatedAt: now,
  }));

  if (reviewAgentRun) {
    await updateAgentRun(ctx, reviewAgentRun.id, (current) => ({
      ...current,
      output: {
        decision: input.decision,
        summary: reviewLog.summary,
        feedback,
        reviewedArtifactIds: reviewLog.reviewedArtifactIds,
        completedAt: now,
        source: 'human_override',
      },
      updatedAt: now,
    }));
  }

  await updateTask(ctx, task.id, (current) => ({
    ...current,
    status: 'completed',
    summary: reviewLog.summary,
    updatedAt: now,
  }));

  const parentTask = await getTask(ctx, task.parentTaskId);
  if (input.decision === 'approved') {
    await acceptStageArtifacts(ctx, task.runId, task.parentTaskId, reviewLog.id, now);
    const completedParent = await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now);
    if (completedParent) {
      await unlockNextPendingStageContainer(ctx, task.runId, completedParent, now);
    }
  } else if (input.decision === 'needs_changes') {
    await rejectReviewedArtifacts(ctx, reviewedArtifacts.map((artifact) => artifact.id), now);
    const reworkCount = await countReworkTasksForParent(ctx, task.runId, task.parentTaskId);
    if (reworkCount >= MAX_REWORK_ATTEMPTS) {
      await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now, feedback, true);
    } else if (parentTask) {
      await createReworkTaskFromReview(ctx, run, parentTask, reviewedArtifacts, feedback, now);
      await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now, feedback, true);
    }
  } else {
    await rejectReviewedArtifacts(ctx, reviewedArtifacts.map((artifact) => artifact.id), now);
    await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now, feedback, true);
  }

  let nextRun: OrchestratorRun = {
    ...run,
    status: input.decision === 'approved'
      ? 'running'
      : input.decision === 'needs_changes' && (await countReworkTasksForParent(ctx, task.runId, task.parentTaskId)) < MAX_REWORK_ATTEMPTS
        ? 'waiting_human'
        : 'failed',
    engineHealthSummary: input.decision === 'approved'
      ? 'Human review approved the stage and orchestration can continue.'
      : input.decision === 'needs_changes'
        ? 'Human review requested changes before orchestration can continue.'
        : 'Human review rejected the stage and stopped automatic orchestration.',
    lastHumanInterventionAt: now,
    lastHumanInterventionSummary: `Human review marked ${task.stageName || task.title} as ${input.decision}.`,
    pendingHumanCheckpoint: input.decision === 'approved' ? undefined : feedback,
    failureState: input.decision === 'approved'
      ? undefined
      : buildRunFailureState(run, {
        kind: input.decision === 'needs_changes'
          ? (await countReworkTasksForParent(ctx, task.runId, task.parentTaskId)) < MAX_REWORK_ATTEMPTS ? 'human_required' : 'non_converging_rework'
          : 'review_deadlock',
        summary: feedback,
        retryable: input.decision === 'needs_changes' && (await countReworkTasksForParent(ctx, task.runId, task.parentTaskId)) < MAX_REWORK_ATTEMPTS,
        requiresHuman: true,
        recommendedAction: input.decision === 'needs_changes'
          ? (await countReworkTasksForParent(ctx, task.runId, task.parentTaskId)) < MAX_REWORK_ATTEMPTS
            ? 'Review the feedback, approve the rework task, then resume the run.'
            : 'Rework has failed to converge. Inspect the stage manually before resuming.'
          : 'Inspect the rejected stage manually before deciding whether to resume or replace this stage.',
        taskId: task.parentTaskId,
        agentRunId: reviewAgentRun?.id,
      }, now),
    pausedAt: input.decision === 'approved' ? undefined : now,
    lastDecisionAt: now,
    lastDecisionSummary: reviewLog.summary,
    updatedAt: now,
  };
  nextRun = await deriveRunStatusFromTasks(ctx, nextRun);
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'run.updated',
    title: input.decision === 'approved' ? 'Human reviewer approved this stage' : 'Human reviewer requested changes',
    detail: feedback,
    createdAt: now,
  });
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });

  if (input.decision === 'approved' && nextRun.activeTaskCount === 0) {
    return wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'user_request' });
  }

  return {
    run: nextRun,
    reviewLog,
  };
}

export async function retryOrchestratorTask(ctx: PluginContext, input: OrchestratorRetryTaskInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  const run = await getRun(ctx, task.runId);
  if (!run) throw new Error(`Run not found: ${task.runId}`);
  if (!['failed', 'waiting_human', 'paused', 'blocked'].includes(task.status)) {
    throw new Error(`Task is not retryable in its current status: ${task.status}`);
  }
  if (run.failureState && !run.failureState.retryable && run.failureState.taskId && run.failureState.taskId !== task.id) {
    throw new Error(`Task is blocked by another non-retryable failure: ${run.failureState.kind}`);
  }
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  if (!agentRun) throw new Error(`Agent run not found for task: ${task.id}`);
  clearAutomaticRetry(task.id);

  const now = Date.now();
  const sessionId = `orchestrator-${run.id}-${task.agentId}-${task.id}-${now}`;
  const nextAgentRun: OrchestratorAgentRun = {
    ...agentRun,
    id: createId('agent_run'),
    sessionId,
    status: 'ready',
    error: undefined,
    startedAt: undefined,
    completedAt: undefined,
    lastEventAt: undefined,
    output: undefined,
    createdAt: now,
    updatedAt: now,
  };
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...(assertTaskStatusTransition(current.status, 'ready'), current),
    status: 'ready',
    latestAgentRunId: nextAgentRun.id,
    sessionId,
    attemptCount: current.attemptCount + 1,
    source: 'rework',
    updatedAt: now,
  }));
  await saveAgentRun(ctx, nextAgentRun);
  if (task.parentTaskId) {
    await recomputeContainerTaskState(ctx, task.runId, task.parentTaskId, now);
  }
  assertRunStatusTransition(run.status, 'running');
  const nextRun: OrchestratorRun = {
    ...run,
    status: 'running',
    failureState: run.failureState?.taskId === task.id ? undefined : run.failureState,
    pendingHumanCheckpoint: run.failureState?.taskId === task.id ? undefined : run.pendingHumanCheckpoint,
    pausedAt: undefined,
    pauseRequestedAt: undefined,
    watchdogStatus: 'healthy',
    watchdogWarning: undefined,
    watchdogCheckedAt: now,
    engineHealthSummary: `${task.agentName || task.title} restarted after human retry.`,
    lastHumanInterventionAt: now,
    lastHumanInterventionSummary: `Retried ${task.agentName || task.title}.`,
    activeTaskCount: isActiveTask(task) ? run.activeTaskCount : run.activeTaskCount + 1,
    updatedAt: now,
  };
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'task.updated',
    title: 'Task retried by human',
    detail: `${task.agentName || task.title} was sent back to execution.`,
    createdAt: now,
  });
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
  if (nextTask && nextAgentRun) {
    void launchDetachedAgentRunSession(ctx, nextRun, nextTask, nextAgentRun, {
      title: `${nextAgentRun.agentName || nextAgentRun.title} · ${nextAgentRun.stageName || 'Retry'}`,
      prompt: `Retry the following orchestration assignment with the latest human guidance.\n\n${nextAgentRun.prompt}`,
      startedDetail: `${task.agentName || task.title} restarted after human retry.`,
    });
  }
  return { run: nextRun, task: nextTask, agentRun: nextAgentRun };
}

export async function skipOrchestratorTask(ctx: PluginContext, input: OrchestratorSkipTaskInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  const run = await getRun(ctx, task.runId);
  if (!run) throw new Error(`Run not found: ${task.runId}`);
  const agentRun = await getAgentRunByTaskId(ctx, task.id);

  if (task.sessionId && isActiveTask(task)) {
    await interruptAgentSession(task.sessionId);
  }
  clearAutomaticRetry(task.id);

  const now = Date.now();
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...(assertTaskStatusTransition(current.status, 'cancelled'), current),
    status: 'cancelled',
    updatedAt: now,
  }));
  const nextAgentRun = agentRun
    ? await updateAgentRun(ctx, agentRun.id, (current) => ({
      ...current,
      status: 'cancelled',
      completedAt: now,
      lastEventAt: now,
      updatedAt: now,
    }))
    : null;
  assertRunStatusTransition(run.status, run.status === 'cancelled' ? 'cancelled' : 'running');
  const nextRun: OrchestratorRun = {
    ...run,
    status: run.status === 'cancelled' ? 'cancelled' : 'running',
    activeTaskCount: Math.max(0, run.activeTaskCount - (isActiveTask(task) ? 1 : 0)),
    pausedAt: undefined,
    pauseRequestedAt: undefined,
    updatedAt: now,
  };
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'task.updated',
    title: 'Task skipped by human',
    detail: `${task.agentName || task.title} was skipped and the flow can continue.`,
    createdAt: now,
  });
  if (task.parentTaskId) {
    const updatedParent = await recomputeContainerTaskState(
      ctx,
      task.runId,
      task.parentTaskId,
      now,
      task.kind === 'review' ? undefined : `${task.agentName || task.title} was skipped.`,
    );
    if (task.kind === 'review' && updatedParent) {
      await unlockNextPendingStageContainer(ctx, task.runId, updatedParent, now);
    }
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
  if (nextRun.status === 'running' && nextRun.activeTaskCount === 0) {
    const awakened = await wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'task_skipped' });
    return { run: awakened, task: nextTask, agentRun: nextAgentRun };
  }
  return { run: nextRun, task: nextTask, agentRun: nextAgentRun };
}

export async function failOrchestratorTask(ctx: PluginContext, taskId: string, error: unknown) {
  const task = await getTask(ctx, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status === 'failed' || task.status === 'completed' || task.status === 'cancelled') {
    const run = await getRun(ctx, task.runId);
    return { run, task };
  }
  const now = Date.now();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const run = await getRun(ctx, task.runId);
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  if (!run || !agentRun) {
    const nextTask = await updateTask(ctx, task.id, (current) => ({
      ...(assertTaskStatusTransition(current.status, 'failed'), current),
      status: 'failed',
      summary: errorMessage,
      updatedAt: now,
    }));
    return { run, task: nextTask };
  }

  if (shouldAutoRecoverTransientFailure(errorMessage, task.attemptCount)) {
    const sessionId = `orchestrator-${run.id}-${task.agentId}-${task.id}-${now}`;
    const retryAgentRun: OrchestratorAgentRun = {
      ...agentRun,
      id: createId('agent_run'),
      sessionId,
      status: 'ready',
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
      lastEventAt: undefined,
      output: undefined,
      createdAt: now,
      updatedAt: now,
    };
    const nextTask = await updateTask(ctx, task.id, (current) => ({
      ...(assertTaskStatusTransition(current.status, 'failed'), current),
      status: 'failed',
      latestAgentRunId: retryAgentRun.id,
      sessionId,
      attemptCount: current.attemptCount + 1,
      summary: `Transient agent failure detected, retrying automatically in ${Math.round(AUTO_RETRY_DELAY_MS / 1000)}s (${current.attemptCount + 1}/${MAX_TRANSIENT_AGENT_RETRIES}).`,
      updatedAt: now,
    }));
    await saveAgentRun(ctx, retryAgentRun);
    if (task.parentTaskId) {
      await updateTask(ctx, task.parentTaskId, (current) => ({
        ...current,
        status: 'running',
        updatedAt: now,
      }));
    }
    const transientRetryScheduled = await scheduleTransientFailureRecovery(
      ctx,
      run,
      { kind: 'task', task, retryAgentRunId: retryAgentRun.id },
      errorMessage,
      now,
    );
    if (transientRetryScheduled) {
      const nextRun = await getRun(ctx, run.id);
      return { run: nextRun || run, task: nextTask };
    }
  }

  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...(assertTaskStatusTransition(current.status, 'failed'), current),
    status: 'failed',
    summary: errorMessage,
    updatedAt: now,
  }));
  if (!run || !nextTask) return { run, task: nextTask };
  clearAutomaticRetry(task.id);

  const nextActiveTaskCount = Math.max(0, run.activeTaskCount - 1);
  const nextStatus = task.failurePolicy === 'skip' ? 'running' : 'paused';
  const nextRun: OrchestratorRun = {
    ...run,
    activeTaskCount: nextActiveTaskCount,
    status: nextStatus,
    pausedAt: nextStatus === 'paused' ? now : run.pausedAt,
    failureState: nextStatus === 'paused'
      ? buildRunFailureState(run, {
        kind: 'agent_runtime_error',
        summary: errorMessage,
        retryable: false,
        requiresHuman: true,
        recommendedAction: task.failurePolicy === 'skip'
          ? 'Inspect the task failure and decide whether to continue with a manual follow-up.'
          : 'Inspect the failed task, update instructions if needed, then retry or resume the run.',
        autoRetryAt: undefined,
        taskId: task.id,
        agentRunId: agentRun.id,
      }, now)
      : undefined,
    lastDecisionAt: now,
    lastDecisionSummary:
      nextStatus === 'paused'
        ? `${task.agentName || task.title} failed and the run is paused.`
        : `${task.agentName || task.title} failed and was skipped.`,
    updatedAt: now,
  };
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'task.updated',
    title: 'Task failed',
    detail: `${task.agentName || task.title} failed: ${errorMessage}`,
    createdAt: now,
  });
  if (task.parentTaskId) {
    await updateTask(ctx, task.parentTaskId, (current) => ({
      ...current,
      status: 'paused',
      updatedAt: now,
    }));
  }
  if (agentRun) {
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'run.updated',
      title: nextStatus === 'paused' ? 'Run paused after failure' : 'Run continued after failure',
      detail: `${agentRun.agentName || agentRun.title} session: ${agentRun.sessionId}`,
      createdAt: now,
    });
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
  if (nextStatus === 'running' && nextRun.activeTaskCount === 0) {
    return wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'task_completed' });
  }
  return { run: nextRun, task: nextTask };
}

export async function interruptOrchestratorTask(ctx: PluginContext, taskId: string) {
  const task = await getTask(ctx, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (!isActiveTask(task)) {
    const run = await getRun(ctx, task.runId);
    return { run, task };
  }
  const now = Date.now();
  const run = await getRun(ctx, task.runId);
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  if (!run) return { run, task };

  if (run.status === 'cancelled') {
    const nextTask = await updateTask(ctx, task.id, (current) => ({
      ...(assertTaskStatusTransition(current.status, 'cancelled'), current),
      status: 'cancelled',
      updatedAt: now,
    }));
    if (agentRun) {
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'cancelled',
        completedAt: now,
        lastEventAt: now,
        updatedAt: now,
      }));
    }
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'task.updated',
      title: 'Task cancelled',
      detail: `${task.agentName || task.title} was cancelled.`,
      createdAt: now,
    });
    return { run, task: nextTask };
  }

  if (run.status === 'pause_requested' || run.status === 'paused') {
    const nextTask = await updateTask(ctx, task.id, (current) => ({
      ...(assertTaskStatusTransition(current.status, 'paused'), current),
      status: 'paused',
      updatedAt: now,
    }));
    if (agentRun) {
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'paused',
        lastEventAt: now,
        updatedAt: now,
      }));
    }
    const remainingActive = Math.max(0, run.activeTaskCount - 1);
    const nextRun: OrchestratorRun = {
      ...run,
      activeTaskCount: remainingActive,
      status: remainingActive === 0 ? 'paused' : 'pause_requested',
      pausedAt: remainingActive === 0 ? now : run.pausedAt,
      updatedAt: now,
    };
    await saveRun(ctx, nextRun);
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: remainingActive === 0 ? 'run.paused' : 'task.updated',
      title: remainingActive === 0 ? 'Run paused' : 'Task paused',
      detail: remainingActive === 0
        ? 'All active tasks have reached a pause point.'
        : `${task.agentName || task.title} paused.`,
      createdAt: now,
    });
    if (task.parentTaskId) {
      await updateTask(ctx, task.parentTaskId, (current) => ({
        ...current,
        status: 'paused',
        updatedAt: now,
      }));
    }
    ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
    return { run: nextRun, task: nextTask };
  }

  return failOrchestratorTask(ctx, task.id, new Error('Agent run interrupted unexpectedly'));
}

export async function cancelOrchestratorRun(ctx: PluginContext, input: OrchestratorCancelRunInput) {
  const run = await getRun(ctx, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status === 'completed' || run.status === 'cancelled') return run;

  const now = Date.now();
  const nextRun: OrchestratorRun = {
    ...run,
    status: 'cancelled',
    activeTaskCount: 0,
    updatedAt: now,
  };

  await saveRun(ctx, nextRun);
  await appendControlIntent(ctx, { runId: run.id, action: 'cancel', createdAt: now });
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'run.updated',
    title: 'Run cancelled',
    detail: 'Further orchestration has been stopped.',
    createdAt: now,
  });
  if (run.currentOrchestratorAgentRunId) {
    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);
    const coordinatorRun = coordinatorRuns.find((item) => item.id === run.currentOrchestratorAgentRunId);
    if (coordinatorRun?.sessionId && isAgentSessionActive(coordinatorRun.sessionId)) {
      await interruptAgentSession(coordinatorRun.sessionId);
    }
  }
  const tasks = await listTasksForRun(ctx, run.id);
  await Promise.all(
    tasks
      .filter((task) => isActiveTask(task) && task.sessionId)
      .map((task) => interruptAgentSession(task.sessionId!)),
  );
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  return nextRun;
}

function isActiveTask(task: OrchestratorAgentTask) {
  if (task.nodeType === 'container') return false;
  return task.status === 'ready' || task.status === 'pending' || task.status === 'running';
}

function buildDispatchCandidates(plan: OrchestratorConfirmedPlan, tasks: OrchestratorAgentTask[]) {
  const stageById = new Map(plan.stages.map((stage) => [stage.id, stage]));
  const runnableContainers = tasks
    .filter((task) => task.nodeType === 'container' && task.stageId && task.status !== 'completed' && task.status !== 'pending')
    .sort((a, b) => {
      const byStatus = rankContainerStatus(a.status) - rankContainerStatus(b.status);
      if (byStatus !== 0) return byStatus;
      return (a.priority || a.order) - (b.priority || b.order) || a.createdAt - b.createdAt;
    });

  for (const containerTask of runnableContainers) {
    const stage = containerTask.stageId ? stageById.get(containerTask.stageId) : null;
    if (!stage) continue;
    const containerPlan = evaluateContainerCandidates(containerTask, stage, tasks);
    if (!containerPlan.completed) return containerPlan;
  }

  for (const stage of plan.stages) {
    const stagePlan = evaluateStageCandidates(stage, tasks);
    if (!stagePlan.completed) return stagePlan;
  }
  return {
    completed: true,
    candidates: [] as Dispatch[],
    stageNames: [] as string[],
    activeCount: 0,
    currentStageId: undefined,
    currentStageName: undefined,
  };
}

function rankContainerStatus(status: OrchestratorAgentTask['status']) {
  if (status === 'waiting_review') return 0;
  if (status === 'ready') return 1;
  if (status === 'blocked') return 2;
  if (status === 'paused') return 3;
  if (status === 'running') return 4;
  return 5;
}

function buildOrchestrationInput(
  context: OrchestrationContext,
  candidateDispatches: Dispatch[],
  reviewPolicy?: Awaited<ReturnType<typeof getReviewPolicy>> | null,
): OrchestrationInputSnapshot {
  const currentStage = context.run.currentStageId
    ? context.run.confirmedPlan.stages.find((stage) => stage.id === context.run.currentStageId) || null
    : null;
  const currentStageDraftArtifacts = context.run.currentStageId
    ? context.artifacts.filter((artifact) => artifact.stageId === context.run.currentStageId && artifact.status === 'draft')
    : [];
  const currentStageReviewableOutputPaths = Array.from(new Set(
    currentStageDraftArtifacts.flatMap((artifact) => artifact.filePaths || []).filter(Boolean),
  ));
  const currentStageDraftOutputSummaries = currentStageDraftArtifacts.map((artifact) =>
    `${artifact.name}: ${artifact.summary}${artifact.filePaths.length ? ` (${artifact.filePaths.join(', ')})` : ''}`,
  );
  const currentStageAllowedDispatchKinds = Array.from(new Set(
    candidateDispatches
      .filter((dispatch) => !context.run.currentStageId || dispatch.stage.id === context.run.currentStageId)
      .map((dispatch) => dispatch.kind),
  ));
  const readyTaskTitles = context.tasks
    .filter((task) => task.status === 'ready')
    .map((task) => task.title);
  const blockedTaskTitles = context.tasks
    .filter((task) => task.status === 'blocked')
    .map((task) => task.title);
  const waitingReviewTaskTitles = context.tasks
    .filter((task) => task.status === 'waiting_review')
    .map((task) => task.title);
  return {
    runGoal: context.run.goal,
    planTitle: context.run.planTitle,
    planOverview: context.run.confirmedPlan.overview,
    decompositionPrinciples: context.run.confirmedPlan.decompositionPrinciples,
    humanCheckpoints: context.run.confirmedPlan.humanCheckpoints,
    reviewCheckpoints: context.run.confirmedPlan.reviewCheckpoints,
    reviewPolicy: context.run.confirmedPlan.reviewPolicy,
    structuredReviewPolicy: reviewPolicy || undefined,
    wakeReason: context.wakeReason,
    currentStageId: context.run.currentStageId,
    currentStageName: context.run.currentStageName,
    currentStageTargetFolder: currentStage?.targetFolder,
    currentStageOutputFiles: currentStage?.outputFiles || [],
    currentStageReviewableOutputPaths,
    currentStageDraftOutputSummaries,
    currentStageAllowedDispatchKinds,
    activeTaskCount: context.activeTaskCount,
    availableSlots: context.availableSlots,
    readyTaskTitles,
    blockedTaskTitles,
    waitingReviewTaskTitles,
    latestReviewSummaries: context.reviewLogs.slice(0, 3).map((log) => `${log.decision}: ${log.summary}`),
    projectStateSummary: summarizeProjectState(context.projectState),
    actionableTasks: context.tasks
      .filter((task) => task.nodeType === 'container' && !['completed', 'cancelled', 'interrupted', 'failed'].includes(task.status))
      .sort((a, b) => (a.priority || a.order) - (b.priority || b.order) || a.createdAt - b.createdAt)
      .map((task) => `${task.id} | ${task.status} | ${task.stageName || task.title} | ${task.summary || '-'}`),
    candidateDispatches: candidateDispatches.map((dispatch) =>
      [
        dispatch.kind.toUpperCase(),
        dispatch.stage.name,
        dispatch.agentName,
        `targetFolder=${dispatch.stage.targetFolder}`,
        `expectedFiles=${dispatch.stage.outputFiles.join(', ') || '-'}`,
      ].join(' · '),
    ),
  };
}

function buildOrchestrationPrompt(input: OrchestrationInputSnapshot) {
  return [
    `You are the Orchestration Agent for "${input.planTitle}".`,
    'Your only job is to continue the project by orchestration.',
    'Do not do the work yourself.',
    'Read the plan, current task state, recent review results, and current output structure, then decide the next delegation step.',
    'Your main task right now is to decide who should work next, what they should do now, what they may read if needed, and what they must write.',
    `Project goal: ${input.runGoal}`,
    `Wake reason: ${input.wakeReason || 'system'}`,
    input.currentStageId ? `Current stage id: ${input.currentStageId}` : null,
    input.currentStageName ? `Current stage: ${input.currentStageName}` : null,
    `Plan:\n${input.planOverview}`,
    input.decompositionPrinciples.length ? `Decomposition principles:\n- ${input.decompositionPrinciples.join('\n- ')}` : 'Decomposition principles:\n- none',
    input.humanCheckpoints.length ? `Human checkpoints:\n- ${input.humanCheckpoints.join('\n- ')}` : 'Human checkpoints:\n- none',
    input.reviewCheckpoints.length ? `Review checkpoints:\n- ${input.reviewCheckpoints.join('\n- ')}` : 'Review checkpoints:\n- none',
    input.structuredReviewPolicy
      ? `Structured review policy:\n- defaultRequiresReview=${String(input.structuredReviewPolicy.defaultRequiresReview)}\n- allowHumanOverride=${String(input.structuredReviewPolicy.allowHumanOverride)}`
      : 'Structured review policy:\n- none',
    input.readyTaskTitles.length ? `Ready now:\n- ${input.readyTaskTitles.join('\n- ')}` : 'Ready now:\n- none',
    input.blockedTaskTitles.length ? `Blocked:\n- ${input.blockedTaskTitles.join('\n- ')}` : 'Blocked:\n- none',
    input.waitingReviewTaskTitles.length ? `Waiting review:\n- ${input.waitingReviewTaskTitles.join('\n- ')}` : 'Waiting review:\n- none',
    input.latestReviewSummaries.length ? `Recent reviews:\n- ${input.latestReviewSummaries.join('\n- ')}` : 'Recent reviews:\n- none',
    input.currentStageDraftOutputSummaries.length
      ? `Draft outputs waiting for review:\n- ${input.currentStageDraftOutputSummaries.join('\n- ')}`
      : 'Draft outputs waiting for review:\n- none',
    input.projectStateSummary.length ? `Existing output structure:\n- ${input.projectStateSummary.join('\n- ')}` : 'Existing output structure:\n- none',
    input.actionableTasks.length ? `Actionable tasks:\n- ${input.actionableTasks.join('\n- ')}` : 'Actionable tasks:\n- none',
    input.currentStageAllowedDispatchKinds.length
      ? `Allowed dispatch kinds for the current stage: ${input.currentStageAllowedDispatchKinds.join(', ')}`
      : 'Allowed dispatch kinds for the current stage: none',
    input.currentStageTargetFolder ? `Planned output folder for this stage: ${input.currentStageTargetFolder}` : null,
    input.currentStageOutputFiles.length ? `Planned output files for this stage:\n- ${input.currentStageOutputFiles.join('\n- ')}` : null,
    input.currentStageReviewableOutputPaths.length ? `Reviewable output paths for this stage:\n- ${input.currentStageReviewableOutputPaths.join('\n- ')}` : null,
    'If you delegate, make the assignment concrete and focused on the current stage.',
    'If you dispatch, choose only the next work or review step for the current stage.',
    'Candidate dispatches are exhaustive. You must choose only from the allowed dispatch kinds shown above.',
    'You may also return taskOperations to activate a blocked or pending task, reprioritize a task, or mark a task blocked for human attention.',
    'Accepted project state shows only outputs that already passed review. Draft outputs waiting for review may appear separately and still require a review dispatch.',
    'If the current stage is waiting for review, or review is the only allowed dispatch kind, you must dispatch review.',
    'Only dispatch work when work is an allowed dispatch kind and there are no draft outputs waiting for review for the current stage.',
    'Keep the existing output location unless the plan requires a change.',
    'Return one JSON object only.',
    'status must be one of: dispatch, wait, throttle, complete.',
    'Return keys: status, summary, currentStageId, currentStageName, currentAgentId, currentAgentName, taskOperations, dispatches.',
    'currentStageId must exactly equal the current stage id shown above. Do not invent or rename stage ids.',
    'taskOperations must be an array. Use an empty array if there are none.',
    'taskOperations may use only: wait, complete_run, activate_task, block_task, reprioritize_task, create_task, create_checkpoint.',
    'Each task operation object must use the key "type". Never use the key "action".',
    'activate_task and block_task require taskId. reprioritize_task requires taskId and priority.',
    'create_task requires parentTaskId, title, targetFolder, and expectedFiles. Use it to split the current stage into a new child task.',
    'create_checkpoint requires parentTaskId and note. Use it to request explicit human approval before continuing.',
    'Use the current stage. Do not invent ids, new file names, or extra agents.',
    'Each dispatch must contain only: parentTaskId, stageId, stageName, kind, assignmentBrief.',
    'kind must be either "work" or "review".',
    'parentTaskId must exactly match one candidate parent task in the current stage.',
    'assignmentBrief must contain: title, whyNow, goal, context, inputArtifacts, instructions, acceptanceCriteria, deliverables, targetFolder, expectedFiles, reviewTargetPaths, reviewFocus, risks.',
    'Valid taskOperations example: [{"type":"activate_task","taskId":"task_123"}]',
    'If there are no task operations, return "taskOperations": [].',
  ].filter(Boolean).join('\n\n');
}

function buildOrchestrationDecisionRecord(
  decision: OrchestrationDecision,
  orchestrationInput: OrchestrationInputSnapshot | undefined,
  createdAt: number,
): OrchestrationDecisionRecord {
  return {
    status: decision.status,
    summary: decision.summary,
    dispatchCount: decision.dispatches.length,
    currentStageId: decision.currentStageId,
    currentStageName: decision.currentStageName,
    currentAgentId: decision.currentAgentId,
    currentAgentName: decision.currentAgentName,
    allowedDispatchKinds: [...(orchestrationInput?.currentStageAllowedDispatchKinds || [])],
    candidateDispatches: [...(orchestrationInput?.candidateDispatches || [])],
    selectedParentTaskIds: Array.from(new Set(decision.dispatches.map((dispatch) => dispatch.parentTaskId))),
    dispatchTitles: decision.dispatches.map((dispatch) => `${dispatch.agentName} -> ${dispatch.stageName}`),
    assignmentTitles: decision.dispatches.map((dispatch) => dispatch.assignmentBrief.title),
    assignments: decision.dispatches.map((dispatch) => dispatch.assignmentBrief),
    taskOperationTypes: decision.taskOperations.map((operation) => operation.type),
    taskOperationSummaries: decision.taskOperations.map((operation) => `${operation.type}${operation.note ? `: ${operation.note}` : ''}`),
    createdAt,
  };
}

function parseOrchestrationDecisionJson(
  raw: string,
  context: OrchestrationContext,
  candidates: Dispatch[],
): OrchestrationDecision {
  const parsed = JSON.parse(normalizeAssistantJson(raw)) as Partial<OrchestrationDecision>;
  const status = parsed.status;
  if (!status || !['dispatch', 'wait', 'throttle', 'complete'].includes(status)) {
    throw new Error('Orchestrator agent returned an invalid decision status.');
  }
  if (parsed.currentStageId && context.run.currentStageId && parsed.currentStageId !== context.run.currentStageId) {
    throw new Error(`Orchestrator agent returned an invalid currentStageId: ${parsed.currentStageId}. Expected ${context.run.currentStageId}.`);
  }
  const dispatches = status === 'dispatch'
    ? (parsed.dispatches || []).map((dispatch) => {
      if (!dispatch.kind || (dispatch.kind !== 'work' && dispatch.kind !== 'review')) {
        throw new Error('Orchestrator agent must return dispatch.kind as "work" or "review".');
      }
      if (!dispatch.parentTaskId) {
        throw new Error('Orchestrator agent must return dispatch.parentTaskId.');
      }
      if (!dispatch.assignmentBrief || typeof dispatch.assignmentBrief !== 'object') {
        throw new Error('Orchestrator agent must return dispatch.assignmentBrief.');
      }
      const currentStageCandidates = candidates.filter((candidate) => candidate.stage.id === context.run.currentStageId);
      const candidate = inferDispatchCandidate(dispatch, currentStageCandidates.length ? currentStageCandidates : candidates, context);
      if (!candidate) {
        throw new Error(`Orchestrator agent selected an invalid dispatch target: ${dispatch.kind}`);
      }
      const assignmentBrief = normalizeDispatchAssignmentBrief(dispatch, candidate, context.run.id);
      if (!assignmentBrief.targetFolder || typeof assignmentBrief.targetFolder !== 'string') {
        throw new Error(`Orchestrator agent did not provide a valid targetFolder for dispatch ${candidate.parentTask.id}`);
      }
      if (!Array.isArray(assignmentBrief.expectedFiles) || assignmentBrief.expectedFiles.length === 0) {
        throw new Error(`Orchestrator agent did not provide expectedFiles for dispatch ${candidate.parentTask.id}`);
      }
      if (!Array.isArray(assignmentBrief.reviewTargetPaths)) {
        throw new Error(`Orchestrator agent did not provide reviewTargetPaths for dispatch ${candidate.parentTask.id}`);
      }
      return {
        parentTaskId: candidate.parentTask.id,
        stageId: candidate.stage.id,
        stageName: candidate.stage.name,
        kind: candidate.kind,
        agentId: candidate.agentId,
        agentName: candidate.agentName,
        assignmentBrief,
      };
    })
    : [];

  const taskOperations = Array.isArray(parsed.taskOperations) ? parsed.taskOperations : [];
  return validateOrchestrationDecision({
    status,
    summary: parsed.summary || `Orchestrator agent returned ${status}.`,
    taskOperations,
    currentStageId: parsed.currentStageId,
    currentStageName: parsed.currentStageName,
    currentAgentId: parsed.currentAgentId,
    currentAgentName: parsed.currentAgentName,
    dispatches,
  }, context, candidates);
}

function inferDispatchCandidate(
  dispatch: Partial<Dispatch>,
  candidates: Dispatch[],
  context: OrchestrationContext,
) {
  if (!dispatch.kind || !dispatch.parentTask?.id) return null;
  const stageScoped = context.run.currentStageId
    ? candidates.filter((candidate) => candidate.stage.id === context.run.currentStageId)
    : candidates;
  const matched = stageScoped.filter((candidate) =>
    candidate.kind === dispatch.kind
    && candidate.parentTask.id === dispatch.parentTask?.id
    && (!dispatch.stage?.id || candidate.stage.id === dispatch.stage.id)
  );
  return matched.length === 1 ? matched[0] : null;
}

function validateOrchestrationDecision(
  decision: OrchestrationDecision,
  context: OrchestrationContext,
  candidates: Dispatch[],
): OrchestrationDecision {
  const allowedKinds = new Set(
    candidates
      .filter((candidate) => !context.run.currentStageId || candidate.stage.id === context.run.currentStageId)
      .map((candidate) => candidate.kind),
  );
  if (!decision.summary?.trim()) {
    throw new Error('Orchestrator agent must return a non-empty summary.');
  }
  if (decision.status !== 'dispatch' && decision.dispatches.length > 0) {
    throw new Error(`Decision status ${decision.status} cannot include dispatches.`);
  }
  if (decision.status === 'dispatch' && decision.dispatches.length === 0) {
    throw new Error('Dispatch decisions must include at least one dispatch.');
  }
  if (decision.dispatches.length > context.availableSlots) {
    throw new Error(`Decision exceeds available slots: ${decision.dispatches.length} > ${context.availableSlots}.`);
  }
  const seenDispatchKeys = new Set<string>();
  for (const dispatch of decision.dispatches) {
    if (!allowedKinds.has(dispatch.kind)) {
      throw new Error(`Dispatch kind ${dispatch.kind} is not allowed for the current stage.`);
    }
    if (context.run.currentStageId && dispatch.stageId !== context.run.currentStageId) {
      throw new Error(`Dispatch stage ${dispatch.stageId} does not match the current stage ${context.run.currentStageId}.`);
    }
    const key = `${dispatch.parentTaskId}:${dispatch.kind}`;
    if (seenDispatchKeys.has(key)) {
      throw new Error(`Duplicate dispatch selected for ${key}.`);
    }
    seenDispatchKeys.add(key);
    const matchedCandidate = inferDispatchCandidate(dispatch, candidates, context);
    if (!matchedCandidate) {
      throw new Error(`Dispatch target is not in the current candidate set: ${dispatch.parentTaskId}/${dispatch.kind}.`);
    }
  }

  for (const operation of decision.taskOperations) {
    if (!operation || typeof operation !== 'object') {
      throw new Error('Orchestrator agent returned an invalid task operation.');
    }
    if ('action' in operation && !('type' in operation)) {
      throw new Error('Orchestrator agent used taskOperations.action. Use taskOperations.type instead.');
    }
    if (!('type' in operation)) {
      throw new Error('Orchestrator agent returned a task operation without type.');
    }
    if (!['wait', 'complete_run', 'activate_task', 'block_task', 'reprioritize_task', 'create_task', 'create_checkpoint'].includes(operation.type as string)) {
      throw new Error(`Unsupported task operation: ${String(operation.type)}`);
    }
    if (decision.status === 'complete' && operation.type !== 'complete_run') {
      throw new Error('Complete decisions may only include complete_run operations.');
    }
    if (['activate_task', 'block_task', 'reprioritize_task'].includes(operation.type as string)) {
      if (!operation.taskId) {
        throw new Error(`Task operation ${String(operation.type)} requires taskId.`);
      }
      const targetTask = context.tasks.find((task) => task.id === operation.taskId);
      if (!targetTask) {
        throw new Error(`Task operation targets an unknown task: ${operation.taskId}.`);
      }
      if (context.run.currentStageId && targetTask.stageId && targetTask.stageId !== context.run.currentStageId) {
        throw new Error(`Task operation ${operation.type} targets a task outside the current stage.`);
      }
      if (['completed', 'cancelled'].includes(targetTask.status)) {
        throw new Error(`Task operation ${operation.type} cannot target a completed or cancelled task.`);
      }
    }
    if (operation.type === 'reprioritize_task' && typeof operation.priority !== 'number') {
      throw new Error('reprioritize_task requires numeric priority.');
    }
    if (operation.type === 'create_task') {
      if (!operation.parentTaskId || !operation.title || !operation.targetFolder || !Array.isArray(operation.expectedFiles) || operation.expectedFiles.length === 0) {
        throw new Error('create_task requires parentTaskId, title, targetFolder, and expectedFiles.');
      }
      const parentTask = context.tasks.find((task) => task.id === operation.parentTaskId);
      if (!parentTask) {
        throw new Error(`create_task parent does not exist: ${operation.parentTaskId}.`);
      }
      if (context.run.currentStageId && parentTask.stageId && parentTask.stageId !== context.run.currentStageId) {
        throw new Error('create_task must stay inside the current stage.');
      }
    }
    if (operation.type === 'create_checkpoint') {
      if (!operation.parentTaskId || !operation.note?.trim()) {
        throw new Error('create_checkpoint requires parentTaskId and note.');
      }
      const parentTask = context.tasks.find((task) => task.id === operation.parentTaskId);
      if (!parentTask) {
        throw new Error(`create_checkpoint parent does not exist: ${operation.parentTaskId}.`);
      }
      if (context.run.currentStageId && parentTask.stageId && parentTask.stageId !== context.run.currentStageId) {
        throw new Error('create_checkpoint must stay inside the current stage.');
      }
    }
  }
  return decision;
}

async function createHumanCheckpointTask(
  ctx: PluginContext,
  runId: string,
  parentTask: OrchestratorAgentTask,
  note: string,
  now: number,
) {
  const siblingTasks = (await listTasksForRun(ctx, runId)).filter((task) => task.parentTaskId === parentTask.id);
  const nextOrder = siblingTasks.length > 0 ? Math.max(...siblingTasks.map((task) => task.order)) + 1 : parentTask.order + 1;
  const checkpointTask: OrchestratorAgentTask = {
    id: createId('task'),
    runId,
    nodeType: 'checkpoint',
    kind: 'checkpoint',
    parentTaskId: parentTask.id,
    rootTaskId: parentTask.rootTaskId,
    depth: parentTask.depth + 1,
    order: nextOrder,
    source: 'orchestrator_split',
    attemptCount: 0,
    stageId: parentTask.stageId,
    planStageId: parentTask.planStageId || parentTask.stageId,
    stageName: parentTask.stageName,
    title: `Human checkpoint: ${parentTask.stageName || parentTask.title}`,
    status: 'waiting_human',
    objective: note,
    inputs: parentTask.latestArtifactIds || [],
    expectedOutputs: [],
    blockedReason: note,
    summary: note,
    createdAt: now,
    updatedAt: now,
  };
  await saveTask(ctx, checkpointTask);
  return checkpointTask;
}

async function createReworkTaskFromReview(
  ctx: PluginContext,
  run: OrchestratorRun,
  parentTask: OrchestratorAgentTask,
  reviewedArtifacts: OrchestratorArtifact[],
  feedback: string,
  now: number,
) {
  const tasks = await listTasksForRun(ctx, run.id);
  const siblingTasks = tasks.filter((task) => task.parentTaskId === parentTask.id);
  const nextOrder = siblingTasks.length > 0 ? Math.max(...siblingTasks.map((task) => task.order)) + 1 : parentTask.order + 1;
  const reworkTask: OrchestratorAgentTask = {
    id: createId('task'),
    runId: run.id,
    nodeType: 'work',
    kind: 'work',
    parentTaskId: parentTask.id,
    rootTaskId: parentTask.rootTaskId,
    depth: parentTask.depth + 1,
    order: nextOrder,
    source: 'rework',
    attemptCount: 0,
    stageId: parentTask.stageId,
    planStageId: parentTask.planStageId || parentTask.stageId,
    stageName: parentTask.stageName,
    agentId: parentTask.agentId || `${parentTask.stageId}:work`,
    agentName: `${parentTask.stageName || parentTask.title} Rework Agent`,
    title: `${parentTask.stageName || parentTask.title} rework`,
    status: 'waiting_human',
    objective: feedback,
    inputs: reviewedArtifacts.map((artifact) => artifact.id),
    expectedOutputs: parentTask.expectedFiles || parentTask.expectedOutputs || [],
    reviewRequired: true,
    blockedReason: feedback,
    targetFolder: parentTask.targetFolder,
    expectedFiles: parentTask.expectedFiles || parentTask.expectedOutputs || [],
    summary: feedback,
    failurePolicy: 'pause',
    createdAt: now,
    updatedAt: now,
  };
  await saveTask(ctx, reworkTask);
  return reworkTask;
}

async function countReworkTasksForParent(ctx: PluginContext, runId: string, parentTaskId: string) {
  const tasks = await listTasksForRun(ctx, runId);
  return tasks.filter((task) => task.parentTaskId === parentTaskId && task.source === 'rework' && task.kind === 'work').length;
}

function ensureDispatchPreconditions(
  dispatch: Dispatch,
  tasks: OrchestratorAgentTask[],
) {
  if (dispatch.parentTask.requiresHumanApproval) {
    throw new Error(`Cannot dispatch ${dispatch.parentTask.title} before human approval.`);
  }
  if (dispatch.parentTask.dependencyTaskIds?.length) {
    const unmet = dispatch.parentTask.dependencyTaskIds.filter((taskId) => !tasks.some((task) => task.id === taskId && task.status === 'completed'));
    if (unmet.length > 0) {
      throw new Error(`Cannot dispatch ${dispatch.parentTask.title} before dependency tasks complete.`);
    }
  }
  const childTasks = tasks.filter((task) => task.parentTaskId === dispatch.parentTask.id);
  const completedWorkTasks = childTasks.filter((task) => task.kind === 'work' && task.status === 'completed');

  if (dispatch.kind === 'review' && completedWorkTasks.length === 0) {
    throw new Error(`Cannot dispatch review for ${dispatch.stage.name} before a work task completes.`);
  }
}

function normalizeDispatchAssignmentBrief(
  dispatch: Partial<Dispatch> & { assignmentBrief?: Partial<AssignmentBrief> },
  candidate: Dispatch,
  runId: string,
): AssignmentBrief {
  const rawBrief: Partial<AssignmentBrief> = dispatch.assignmentBrief && typeof dispatch.assignmentBrief === 'object'
    ? dispatch.assignmentBrief
    : {};

  const normalizeArray = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
    if (typeof value === 'string' && value.trim()) {
      return [value.trim()];
    }
    return [] as string[];
  };

  const targetFolder = typeof rawBrief.targetFolder === 'string' && rawBrief.targetFolder.trim()
    ? rawBrief.targetFolder
    : candidate.stage.targetFolder;
  const expectedFiles = normalizeArray(rawBrief.expectedFiles).length ? normalizeArray(rawBrief.expectedFiles) : [...candidate.stage.outputFiles];
  const reviewTargetPaths = normalizeArray(rawBrief.reviewTargetPaths).length
    ? normalizeArray(rawBrief.reviewTargetPaths)
    : expectedFiles.map((file) => `${targetFolder}/${file}`);

  return {
    assignmentId: rawBrief.assignmentId || createId('assignment'),
    runId,
    taskId: candidate.parentTask.id,
    kind: candidate.kind,
    title: rawBrief.title || `${candidate.stage.name} ${candidate.kind === 'review' ? 'Review' : 'Work'}`,
    whyNow: rawBrief.whyNow || `Continue the ${candidate.stage.name} stage.`,
    goal: rawBrief.goal || candidate.goal,
    context: normalizeArray(rawBrief.context),
    inputArtifacts: normalizeArray(rawBrief.inputArtifacts),
    instructions: normalizeArray(rawBrief.instructions),
    acceptanceCriteria: normalizeArray(rawBrief.acceptanceCriteria),
    deliverables: normalizeArray(rawBrief.deliverables).length ? normalizeArray(rawBrief.deliverables) : [...candidate.stage.deliverables],
    targetFolder,
    expectedFiles,
    reviewTargetPaths,
    reviewFocus: normalizeArray(rawBrief.reviewFocus),
    risks: normalizeArray(rawBrief.risks),
    createdAt: Date.now(),
  };
}

function normalizeAssistantJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Orchestrator agent returned an empty decision.');
  }
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Orchestrator agent did not return a valid JSON object.');
  }
  return candidate.slice(firstBrace, lastBrace + 1);
}

export async function applyOrchestratorDecision(
  ctx: PluginContext,
  runId: string,
  coordinatorRunId: string,
  decision: OrchestrationDecision,
) {
  const now = Date.now();
  const run = await getRun(ctx, runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }
  const tasks = await listTasksForRun(ctx, runId);
  const reviewLogs = await listReviewLogsForRun(ctx, runId);
  const projectState = await getProjectState(ctx, runId);
  const artifacts = await listArtifactsForRun(ctx, runId);
  const dispatchPlan = buildDispatchCandidates(run.confirmedPlan, tasks);
  const orchestrationContext: OrchestrationContext = {
    run,
    wakeReason: run.lastWakeReason,
    tasks,
    reviewLogs,
    projectState,
    artifacts,
    activeTaskCount: tasks.filter((task) => isLiveTask(task)).length,
    availableSlots: Math.max(0, (run.maxConcurrentTasks || 2) - tasks.filter((task) => isLiveTask(task)).length),
  };
  const validatedDecision = validateOrchestrationDecision(decision, orchestrationContext, dispatchPlan.candidates);
  const firstDispatch = validatedDecision.dispatches[0];
  let nextRun: OrchestratorRun = {
    ...run,
    lastDecisionAt: now,
    lastDecisionSummary: validatedDecision.summary,
    orchestrationDecision: buildOrchestrationDecisionRecord(validatedDecision, run.orchestrationInput, now),
    currentStageId: firstDispatch?.stageId || run.currentStageId || validatedDecision.currentStageId,
    currentStageName: firstDispatch?.stageName || run.currentStageName || validatedDecision.currentStageName,
    currentAgentId: firstDispatch?.agentId || validatedDecision.currentAgentId,
    currentAgentName: firstDispatch?.agentName || validatedDecision.currentAgentName,
    updatedAt: now,
  };

  for (const operation of validatedDecision.taskOperations) {
    if (operation.type === 'complete_run') {
      nextRun = {
        ...nextRun,
        status: 'completed',
        activeTaskCount: 0,
        engineHealthSummary: operation.note || validatedDecision.summary || 'Run completed by the orchestrator agent.',
      };
      continue;
    }
    if (operation.type === 'activate_task' && operation.taskId) {
      await updateTask(ctx, operation.taskId, (current) => ({
        ...current,
        status: current.status === 'completed' ? current.status : 'ready',
        blockedReason: undefined,
        updatedAt: now,
      }));
      continue;
    }
    if (operation.type === 'block_task' && operation.taskId) {
      await updateTask(ctx, operation.taskId, (current) => ({
        ...(current.status === 'completed' ? current : (assertTaskStatusTransition(current.status, 'blocked'), current)),
        status: current.status === 'completed' ? current.status : 'blocked',
        blockedReason: operation.note || current.blockedReason || 'Blocked by orchestrator decision.',
        updatedAt: now,
      }));
      nextRun = {
        ...nextRun,
        status: 'waiting_human',
        pendingHumanCheckpoint: operation.note || 'Human action required before this task can continue.',
        pausedAt: now,
        engineHealthSummary: operation.note || 'Run is waiting for human action because a task requires attention.',
      };
      continue;
    }
    if (operation.type === 'reprioritize_task' && operation.taskId && typeof operation.priority === 'number') {
      await updateTask(ctx, operation.taskId, (current) => ({
        ...current,
        priority: operation.priority,
        updatedAt: now,
      }));
      continue;
    }
    if (operation.type === 'create_task' && operation.parentTaskId && operation.title && operation.targetFolder && operation.expectedFiles?.length) {
      const parentTask = tasks.find((task) => task.id === operation.parentTaskId);
      if (!parentTask) {
        throw new Error(`Parent task not found for create_task: ${operation.parentTaskId}`);
      }
      const siblingTasks = tasks.filter((task) => task.parentTaskId === parentTask.id);
      const nextOrder = siblingTasks.length > 0 ? Math.max(...siblingTasks.map((task) => task.order)) + 1 : parentTask.order + 1;
      const createdTaskStatus = operation.requiresHumanApproval ? 'waiting_human' : 'ready';
      await saveTask(ctx, {
        id: createId('task'),
        runId,
        nodeType: 'container',
        parentTaskId: parentTask.id,
        rootTaskId: parentTask.rootTaskId,
        depth: parentTask.depth + 1,
        order: nextOrder,
        source: 'orchestrator_split',
        latestAgentRunId: undefined,
        attemptCount: 0,
        stageId: parentTask.stageId,
        planStageId: parentTask.planStageId || parentTask.stageId,
        stageName: operation.title,
        title: operation.title,
        status: createdTaskStatus,
        objective: operation.summary || operation.note || operation.title,
        inputs: [],
        expectedOutputs: operation.expectedFiles,
        priority: typeof operation.priority === 'number' ? operation.priority : nextOrder,
        reviewRequired: true,
        blockedReason: operation.requiresHumanApproval ? 'Human approval required before dispatch.' : undefined,
        targetFolder: operation.targetFolder,
        expectedFiles: operation.expectedFiles,
        dependencyTaskIds: operation.dependencyTaskIds || [],
        requiresHumanApproval: Boolean(operation.requiresHumanApproval),
        summary: operation.summary || operation.note || operation.title,
        failurePolicy: 'pause',
        createdAt: now,
        updatedAt: now,
      });
      await updateTask(ctx, parentTask.id, (current) => ({
        ...(current.status === 'completed' ? current : (assertTaskStatusTransition(current.status, createdTaskStatus === 'waiting_human' ? 'waiting_human' : 'running'), current)),
        status: current.status === 'completed' ? current.status : createdTaskStatus === 'waiting_human' ? 'waiting_human' : 'running',
        updatedAt: now,
      }));
      if (createdTaskStatus === 'waiting_human') {
        nextRun = {
          ...nextRun,
          status: 'waiting_human',
          pendingHumanCheckpoint: operation.note || `Human approval required for ${operation.title}.`,
          pausedAt: now,
          engineHealthSummary: operation.note || `Run is waiting for human approval for ${operation.title}.`,
        };
      }
      continue;
    }
    if (operation.type === 'create_checkpoint' && operation.parentTaskId && operation.note?.trim()) {
      const parentTask = tasks.find((task) => task.id === operation.parentTaskId);
      if (!parentTask) {
        throw new Error(`Parent task not found for create_checkpoint: ${operation.parentTaskId}`);
      }
      await createHumanCheckpointTask(ctx, runId, parentTask, operation.note.trim(), now);
      await updateTask(ctx, parentTask.id, (current) => ({
        ...(current.status === 'completed' ? current : (assertTaskStatusTransition(current.status, 'waiting_human'), current)),
        status: current.status === 'completed' ? current.status : 'waiting_human',
        blockedReason: operation.note?.trim(),
        updatedAt: now,
      }));
      nextRun = {
        ...nextRun,
        status: 'waiting_human',
        pendingHumanCheckpoint: operation.note.trim(),
        pausedAt: now,
        engineHealthSummary: operation.note.trim(),
        failureState: buildRunFailureState(nextRun, {
          kind: 'human_required',
          summary: operation.note.trim(),
          retryable: true,
          requiresHuman: true,
          recommendedAction: 'Resolve the human checkpoint, then resume the run.',
          taskId: parentTask.id,
        }, now),
      };
    }
  }

  if (validatedDecision.status === 'dispatch' && nextRun.status !== 'paused' && nextRun.status !== 'waiting_human') {
    const dispatches = resolveDispatches(tasks, validatedDecision);
    nextRun = {
      ...nextRun,
      status: 'running',
      activeTaskCount: tasks.filter((task) => isLiveTask(task)).length + dispatches.length,
      engineHealthSummary: `Dispatching ${dispatches.length} task(s) from ${validatedDecision.currentStageName || 'the current stage'}.`,
    };
    await saveRun(ctx, nextRun);
    for (const dispatch of dispatches) {
      const assignmentBrief = dispatch.assignmentBrief!;
      const task: OrchestratorAgentTask = {
        id: createId('task'),
        runId,
        nodeType: dispatch.kind,
        kind: dispatch.kind,
        parentTaskId: dispatch.parentTask.id,
        rootTaskId: dispatch.parentTask.rootTaskId,
        depth: dispatch.parentTask.depth + 1,
        order: dispatch.parentTask.order + (dispatch.kind === 'work' ? 1 : 2),
        source: dispatch.kind === 'review' ? 'orchestrator_split' : dispatch.parentTask.source,
        latestAgentRunId: undefined,
        attemptCount: 0,
        stageId: dispatch.stage.id,
        planStageId: dispatch.stage.id,
        stageName: dispatch.stage.name,
        agentId: dispatch.agentId,
        agentName: dispatch.agentName,
        title: `${dispatch.agentName} task`,
        reviewRequired: dispatch.kind === 'work',
        status: 'ready',
        objective: assignmentBrief.goal,
        inputs: [...assignmentBrief.inputArtifacts],
        expectedOutputs: [...assignmentBrief.expectedFiles],
        summary: dispatch.assignmentBrief!.goal,
        failurePolicy: 'pause',
        createdAt: now,
        updatedAt: now,
      };
      const sessionId = `orchestrator-${runId}-${dispatch.agentId}-${task.id}`;
      const agentInput = dispatch.kind === 'review'
        ? await buildReviewAgentInput(ctx, nextRun, task, dispatch.stage, assignmentBrief)
        : buildWorkAgentInput(nextRun, dispatch.stage, projectState, reviewLogs, artifacts, assignmentBrief);
      if (dispatch.kind === 'review' && 'reviewedArtifactIds' in agentInput) {
        await markArtifactsUnderReview(ctx, agentInput.reviewedArtifactIds, now);
        task.latestArtifactIds = [...agentInput.reviewedArtifactIds];
      }
      const agentPrompt = dispatch.kind === 'review' ? buildReviewAgentPrompt(agentInput) : buildWorkAgentPrompt(agentInput);
      const agentRun: OrchestratorAgentRun = {
        id: createId('agent_run'),
        runId,
        taskId: task.id,
        planId: nextRun.planId,
        kind: dispatch.kind,
        stageId: dispatch.stage.id,
        stageName: dispatch.stage.name,
        agentId: dispatch.agentId,
        agentName: dispatch.agentName,
        sessionId,
        title: dispatch.agentName,
        prompt: agentPrompt,
        input: agentInput,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      task.latestAgentRunId = agentRun.id;
      task.attemptCount = 1;
      task.sessionId = sessionId;
      await saveTask(ctx, task);
      await updateTask(ctx, dispatch.parentTask.id, (current) => ({
        ...current,
        status: dispatch.kind === 'review' ? 'waiting_review' : 'running',
        objective: current.objective || assignmentBrief.goal,
        inputs: current.inputs || [...assignmentBrief.inputArtifacts],
        expectedOutputs: current.expectedOutputs || [...assignmentBrief.expectedFiles],
        updatedAt: now,
      }));
      await saveAgentRun(ctx, agentRun);
      await appendRunEvent(ctx, {
        id: createId('evt'),
        runId,
        type: 'task.created',
        title: 'Agent task created',
        detail: `${task.agentName} is ready to execute.`,
        createdAt: now,
      });
      void launchDetachedAgentRunSession(ctx, nextRun, task, agentRun, {
        title: `${dispatch.agentName} · ${dispatch.stage.name}`,
        prompt: agentRun.prompt,
        startedDetail: `${dispatch.agentName} started executing in its own session.`,
      });
    }
  } else if (validatedDecision.status === 'wait' || nextRun.status === 'paused' || nextRun.status === 'waiting_human') {
    nextRun = {
      ...nextRun,
      status: nextRun.status === 'paused' || nextRun.status === 'waiting_human' ? nextRun.status : 'running',
      failureState: nextRun.status === 'paused' || nextRun.status === 'waiting_human' ? nextRun.failureState : undefined,
      activeTaskCount: tasks.filter((task) => isLiveTask(task)).length,
      engineHealthSummary: nextRun.status === 'paused' || nextRun.status === 'waiting_human'
        ? nextRun.engineHealthSummary
        : validatedDecision.taskOperations.find((operation) => operation.type === 'wait')?.note || validatedDecision.summary,
    };
    await saveRun(ctx, nextRun);
  } else if (validatedDecision.status === 'throttle') {
    nextRun = {
      ...nextRun,
      status: 'running',
      failureState: undefined,
      activeTaskCount: tasks.filter((task) => isLiveTask(task)).length,
      engineHealthSummary: validatedDecision.summary,
    };
    await saveRun(ctx, nextRun);
  } else {
    nextRun = {
      ...nextRun,
      status: 'completed',
      failureState: undefined,
      activeTaskCount: 0,
      engineHealthSummary: validatedDecision.taskOperations.find((operation) => operation.type === 'complete_run')?.note || 'Run completed with no remaining executable stages.',
    };
    await saveRun(ctx, nextRun);
  }

  await updateCoordinatorRun(ctx, coordinatorRunId, (current) => ({
    ...current,
    status: 'completed',
    completedAt: current.completedAt || now,
    lastEventAt: now,
    decision: nextRun.orchestrationDecision,
    updatedAt: now,
  }));
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId,
    type: 'agent.decision',
    title: 'Orchestrator agent made a decision',
    detail: validatedDecision.summary,
    createdAt: now,
  });
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId });
  return nextRun;
}

function resolveDispatches(tasks: OrchestratorAgentTask[], decision: OrchestrationDecision): Dispatch[] {
  if (decision.status !== 'dispatch') return [];
  return decision.dispatches.map((dispatch) => {
    const parentTask = tasks.find((task) => task.id === dispatch.parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task not found for dispatch: ${dispatch.parentTaskId}`);
    }
    const resolvedDispatch = {
      parentTask,
      stage: {
        id: dispatch.stageId,
        name: dispatch.stageName,
        goal: dispatch.assignmentBrief.goal,
        deliverables: [...dispatch.assignmentBrief.deliverables],
        targetFolder: dispatch.assignmentBrief.targetFolder,
        outputFiles: [...dispatch.assignmentBrief.expectedFiles],
      },
      kind: dispatch.kind,
      agentId: dispatch.agentId,
      agentName: dispatch.agentName,
      goal: dispatch.assignmentBrief.goal,
      assignmentBrief: dispatch.assignmentBrief,
    };
    ensureDispatchPreconditions(resolvedDispatch, tasks);
    return resolvedDispatch;
  });
}

function evaluateStageCandidates(stage: OrchestratorPlanStage, tasks: OrchestratorAgentTask[]) {
  const containerTask = findContainerTask(tasks, stage.id);
  if (!containerTask) {
    return {
      completed: false,
      activeCount: 0,
      candidates: [] as Dispatch[],
      stageNames: [],
      currentStageId: stage.id,
      currentStageName: stage.name,
    };
  }

  return evaluateContainerCandidates(containerTask, stage, tasks);
}

function evaluateContainerCandidates(
  containerTask: OrchestratorAgentTask,
  stage: OrchestratorPlanStage,
  tasks: OrchestratorAgentTask[],
) {
  if (containerTask.status === 'completed') {
    return {
      completed: true,
      activeCount: 0,
      candidates: [] as Dispatch[],
      stageNames: [] as string[],
      currentStageId: undefined,
      currentStageName: undefined,
    };
  }

  const childTasks = tasks.filter((task) => task.parentTaskId === containerTask.id);
  const childContainers = childTasks.filter((task) => task.nodeType === 'container');
  const activeTasks = childTasks.filter((task) => isLiveTask(task));
  const workTasks = childTasks.filter((task) => task.kind === 'work');
  const reviewTasks = childTasks.filter((task) => task.kind === 'review');
  const completedWorkTasks = workTasks.filter((task) => task.status === 'completed');
  const latestReviewTask = [...reviewTasks].sort((a, b) => b.updatedAt - a.updatedAt)[0];

  if (activeTasks.length > 0) {
    return {
      completed: false,
      activeCount: activeTasks.length,
      candidates: [] as Dispatch[],
      stageNames: [] as string[],
      currentStageId: stage.id,
      currentStageName: containerTask.stageName || stage.name,
    };
  }

  const unfinishedChildContainers = childContainers.filter((task) => task.status !== 'completed');
  if (unfinishedChildContainers.length > 0) {
    return {
      completed: false,
      activeCount: 0,
      candidates: [] as Dispatch[],
      stageNames: [containerTask.stageName || stage.name],
      currentStageId: stage.id,
      currentStageName: containerTask.stageName || stage.name,
    };
  }

  if (containerTask.status === 'blocked' || containerTask.status === 'paused' || containerTask.status === 'waiting_human') {
    return {
      completed: false,
      activeCount: 0,
      candidates: [] as Dispatch[],
      stageNames: [containerTask.stageName || stage.name],
      currentStageId: stage.id,
      currentStageName: containerTask.stageName || stage.name,
    };
  }

  if (containerTask.status === 'waiting_review') {
    return {
      completed: false,
      activeCount: 0,
      candidates: completedWorkTasks.length > 0 ? [createDispatch(containerTask, stage, 'review')] : [createDispatch(containerTask, stage, 'work')],
      stageNames: [containerTask.stageName || stage.name],
      currentStageId: stage.id,
      currentStageName: containerTask.stageName || stage.name,
    };
  }

  if (completedWorkTasks.length > 0 && (!latestReviewTask || ['failed', 'cancelled', 'interrupted', 'paused'].includes(latestReviewTask.status))) {
    return {
      completed: false,
      activeCount: 0,
      candidates: [createDispatch(containerTask, stage, 'review')],
      stageNames: [containerTask.stageName || stage.name],
      currentStageId: stage.id,
      currentStageName: containerTask.stageName || stage.name,
    };
  }

  return {
    completed: false,
    activeCount: 0,
    candidates: [createDispatch(containerTask, stage, 'work')],
    stageNames: [containerTask.stageName || stage.name],
    currentStageId: stage.id,
    currentStageName: containerTask.stageName || stage.name,
  };
}

function findContainerTask(tasks: OrchestratorAgentTask[], stageId: string) {
  return tasks.find((task) => task.stageId === stageId && task.nodeType === 'container') || null;
}

async function unlockNextPendingStageContainer(
  ctx: PluginContext,
  runId: string,
  completedContainer: OrchestratorAgentTask,
  now: number,
) {
  const tasks = await listTasksForRun(ctx, runId);
  const rootContainers = tasks
    .filter((task) => task.nodeType === 'container' && !task.parentTaskId)
    .sort((a, b) => (a.priority || a.order) - (b.priority || b.order) || a.createdAt - b.createdAt);
  const completedIndex = rootContainers.findIndex((task) => task.id === completedContainer.id);
  if (completedIndex < 0) return null;
  const nextPending = rootContainers.slice(completedIndex + 1).find((task) => task.status === 'pending');
  if (!nextPending) return null;
  return updateTask(ctx, nextPending.id, (current) => ({
    ...current,
    status: 'ready',
    blockedReason: undefined,
    updatedAt: now,
  }));
}

async function recomputeContainerTaskState(
  ctx: PluginContext,
  runId: string,
  containerTaskId: string,
  now: number,
  blockedReason?: string,
  waitingForHuman = false,
) {
  const tasks = await listTasksForRun(ctx, runId);
  const containerTask = tasks.find((task) => task.id === containerTaskId && task.nodeType === 'container');
  if (!containerTask) return null;

  const childTasks = tasks.filter((task) => task.parentTaskId === containerTaskId);
  const childContainers = childTasks.filter((task) => task.nodeType === 'container');
  const childWorkTasks = childTasks.filter((task) => task.kind === 'work');
  const childReviewTasks = childTasks.filter((task) => task.kind === 'review');

  let nextStatus: OrchestratorAgentTask['status'];
  let nextBlockedReason = blockedReason;
  let reviewSatisfiedAt = containerTask.reviewSatisfiedAt;

  if (childTasks.length === 0) {
    nextStatus = 'ready';
    nextBlockedReason = undefined;
  } else if (waitingForHuman || childTasks.some((task) => task.status === 'waiting_human')) {
    nextStatus = 'waiting_human';
    nextBlockedReason = blockedReason
      || childTasks.find((task) => task.blockedReason)?.blockedReason
      || childTasks.find((task) => task.summary)?.summary
      || containerTask.blockedReason;
  } else if (childTasks.some((task) => task.status === 'blocked' || task.status === 'failed' || task.status === 'paused')) {
    nextStatus = 'blocked';
    nextBlockedReason = blockedReason
      || childTasks.find((task) => task.blockedReason)?.blockedReason
      || childTasks.find((task) => task.summary)?.summary
      || containerTask.blockedReason;
  } else if (childTasks.some((task) => isLiveTask(task) || task.status === 'running' || task.status === 'pending')) {
    nextStatus = 'running';
    nextBlockedReason = undefined;
  } else if (childReviewTasks.some((task) => task.status === 'completed')) {
    nextStatus = 'completed';
    nextBlockedReason = undefined;
    reviewSatisfiedAt = reviewSatisfiedAt || now;
  } else if (childContainers.length > 0 && childContainers.every((task) => task.status === 'completed')) {
    if (!containerTask.reviewRequired) {
      nextStatus = 'completed';
      nextBlockedReason = undefined;
      reviewSatisfiedAt = reviewSatisfiedAt || now;
    } else if (childReviewTasks.some((task) => task.status === 'completed')) {
      nextStatus = 'completed';
      nextBlockedReason = undefined;
      reviewSatisfiedAt = now;
    } else {
      nextStatus = 'waiting_review';
      nextBlockedReason = undefined;
    }
  } else if (childWorkTasks.some((task) => task.status === 'completed')) {
    nextStatus = containerTask.reviewRequired ? 'waiting_review' : 'completed';
    nextBlockedReason = undefined;
    if (!containerTask.reviewRequired) {
      reviewSatisfiedAt = reviewSatisfiedAt || now;
    }
  } else {
    nextStatus = 'running';
    nextBlockedReason = undefined;
  }

  return updateTask(ctx, containerTaskId, (current) => ({
    ...current,
    status: nextStatus,
    blockedReason: nextBlockedReason,
    reviewSatisfiedAt,
    updatedAt: now,
  }));
}

function createDispatch(parentTask: OrchestratorAgentTask, stage: OrchestratorPlanStage, kind: 'work' | 'review'): Dispatch {
  const taskLabel = parentTask.title || stage.name;
  const targetFolder = parentTask.targetFolder || stage.targetFolder;
  const expectedFiles = parentTask.expectedFiles?.length ? parentTask.expectedFiles : stage.outputFiles;
  const deliverables = parentTask.expectedFiles?.length ? parentTask.expectedFiles : stage.deliverables;
  const agentName = kind === 'review'
    ? stage.reviewerName || `${taskLabel} Review Agent`
    : stage.executorName || `${taskLabel} Work Agent`;
  return {
    parentTask,
    stage,
    kind,
    agentId: `${stage.id}:${kind}`,
    agentName,
    goal: kind === 'review'
      ? `Review the outputs of ${taskLabel} against the confirmed plan and approval criteria.`
      : `${parentTask.summary || stage.goal}${deliverables.length > 0 ? ` Deliverables: ${deliverables.join(', ')}.` : ''}`,
    assignmentBrief: {
      assignmentId: createId('assignment'),
      runId: parentTask.runId,
      taskId: parentTask.id,
      kind,
      title: `${taskLabel} ${kind === 'review' ? 'Review' : 'Work'}`,
      whyNow: `Continue the ${taskLabel} task.`,
      goal: kind === 'review'
        ? `Review the outputs of ${taskLabel}.`
        : parentTask.summary || stage.goal,
      context: [],
      inputArtifacts: [],
      instructions: [],
      acceptanceCriteria: [],
      deliverables,
      targetFolder,
      expectedFiles,
      reviewTargetPaths: expectedFiles.map((file) => `${targetFolder}/${file}`),
      reviewFocus: [],
      risks: [],
      createdAt: Date.now(),
    },
  };
}

async function seedPlanTasks(ctx: PluginContext, run: OrchestratorRun, now: number) {
  for (const [index, stage] of run.confirmedPlan.stages.entries()) {
    const task: OrchestratorAgentTask = {
      id: createId('task'),
      runId: run.id,
      nodeType: 'container',
      rootTaskId: '',
      depth: 0,
      order: index,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: stage.id,
      planStageId: stage.id,
      stageName: stage.name,
      title: stage.name,
      priority: index,
      reviewRequired: true,
      status: index === 0 ? 'ready' : 'pending',
      summary: stage.goal,
      createdAt: now,
      updatedAt: now,
    };
    task.rootTaskId = task.id;
    await saveTask(ctx, task);
  }
}

function buildWorkAgentPrompt(input: OrchestratorAgentRun['input']) {
  if (!('acceptedArtifactSummaries' in input)) {
    throw new Error('Expected work agent input.');
  }
  const readableFiles = input.acceptedArtifactSummaries.length
    ? `If needed, first read the already accepted project files that match this stage context.`
    : null;
  const completedContext = input.projectStateSummary.length
    ? `Already completed: ${input.projectStateSummary.slice(0, 4).join(' | ')}`
    : null;
  const recentReview = input.recentReviewSummaries.length
    ? `Recent review notes: ${input.recentReviewSummaries.slice(0, 2).join(' | ')}`
    : null;
  return [
    `You are ${input.stageName || 'the current stage'} Work Agent inside the "${input.planTitle}" run.`,
    `Project goal: ${input.runGoal}`,
    'Focus only on this assignment. Do not plan the whole project. Do not explain your process.',
    completedContext,
    recentReview,
    `Assignment:\n${formatAssignmentBrief(input.assignmentBrief)}`,
    readableFiles,
    `Target folder: ${input.targetFolder}`,
    `Required files:\n- ${input.expectedFiles.join('\n- ')}`,
    input.constraints.length ? `Constraints:\n- ${input.constraints.join('\n- ')}` : null,
    'Use only the built-in file tools named "read", "write", and "edit" when needed.',
    'You must actually use the tool system for file changes. Never print raw <minimax:tool_call> or <invoke ...> markup in your final answer.',
    `After your work, this stage will go to review. Review focus: ${input.assignmentBrief.reviewFocus.join(' | ') || 'follow the assignment exactly.'}`,
    'After the file work is finished, your final chat response must only be a short completion summary of what was written.',
  ].filter(Boolean).join('\n\n');
}

function buildWorkAgentInput(
  run: OrchestratorRun,
  stage: OrchestratorPlanStage,
  projectState: OrchestratorProjectState | null,
  reviewLogs: OrchestratorReviewLog[],
  artifacts: OrchestratorArtifact[],
  assignmentBrief: AssignmentBrief,
) {
  const projectStateSummary = summarizeProjectState(projectState);
  const acceptedArtifactSummaries = artifacts
    .filter((artifact) => artifact.status === 'accepted')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-6)
    .map((artifact) => `${artifact.stageName || 'Stage'}: ${artifact.summary}`);
  const requestedInputArtifactSummaries = assignmentBrief.inputArtifacts.length
    ? artifacts
      .filter((artifact) => assignmentBrief.inputArtifacts.includes(artifact.id))
      .map((artifact) => `${artifact.stageName || 'Stage'}: ${artifact.summary}`)
    : [];
  const recentReviewSummaries = reviewLogs
    .slice(0, 3)
    .map((log) => `${log.stageName || 'Stage'} (${log.decision}): ${log.summary}`);
  return {
    assignmentBrief,
    runGoal: run.goal,
    planTitle: run.planTitle,
    stageId: stage.id,
    stageName: stage.name,
    constraints: [...run.confirmedPlan.constraints],
    targetFolder: assignmentBrief.targetFolder,
    expectedFiles: [...assignmentBrief.expectedFiles],
    acceptedArtifactSummaries: requestedInputArtifactSummaries.length ? requestedInputArtifactSummaries : acceptedArtifactSummaries,
    recentReviewSummaries,
    projectStateSummary,
  };
}

async function buildReviewAgentInput(
  ctx: PluginContext,
  run: OrchestratorRun,
  task: OrchestratorAgentTask,
  stage: OrchestratorPlanStage,
  assignmentBrief: AssignmentBrief,
) {
  const projectState = await getProjectState(ctx, run.id);
  const reviewedArtifacts = await listReviewedArtifacts(
    ctx,
    run.id,
    task.parentTaskId || '',
    assignmentBrief.reviewTargetPaths,
  );
  return {
    assignmentBrief,
    runGoal: run.goal,
    planTitle: run.planTitle,
    stageId: stage.id,
    stageName: stage.name,
    constraints: [...run.confirmedPlan.constraints],
    targetFolder: assignmentBrief.targetFolder,
    expectedFiles: [...assignmentBrief.expectedFiles],
    reviewedTaskId: task.parentTaskId,
    reviewedArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
    reviewedArtifactSummaries: reviewedArtifacts.map((artifact) => artifact.summary),
    reviewedArtifactPaths: Array.from(new Set(
      reviewedArtifacts.flatMap((artifact) => artifact.filePaths).filter(Boolean),
    )),
    projectStateSummary: summarizeProjectState(projectState),
  };
}

function buildReviewAgentPrompt(input: OrchestratorAgentRun['input']) {
  if (!('reviewedArtifactIds' in input)) {
    throw new Error('Expected review agent input.');
  }
  const completedContext = input.projectStateSummary.length
    ? `Accepted project state: ${input.projectStateSummary.slice(0, 4).join(' | ')}`
    : null;
  return [
    `You are ${input.stageName || 'the current stage'} Review Agent inside the "${input.planTitle}" run.`,
    `Project goal: ${input.runGoal}`,
    'Judge whether this stage output is good enough for the next stage. Do not rewrite it.',
    `Review assignment:\n${formatAssignmentBrief(input.assignmentBrief)}`,
    input.reviewedArtifactSummaries.length
      ? `Artifacts under review:\n- ${input.reviewedArtifactSummaries.join('\n- ')}`
      : 'Artifacts under review: none were attached.',
    `Target folder: ${input.targetFolder}`,
    input.reviewedArtifactPaths.length
      ? `Read and review only these files:\n- ${input.reviewedArtifactPaths.join('\n- ')}`
      : `Read and review only these expected files:\n- ${input.expectedFiles.map((file) => `${input.targetFolder}/${file}`).join('\n- ')}`,
    'Do not search the workspace, list directories, or inspect unrelated files.',
    'Use only the built-in file tool named "read" when needed.',
    'Never print raw <minimax:tool_call> or <invoke ...> markup in your final answer.',
    completedContext,
    input.constraints.length ? `Constraints:\n- ${input.constraints.join('\n- ')}` : null,
    'Your final answer must include one explicit final decision line in plain text: "Decision: approved", "Decision: needs_changes", or "Decision: rejected".',
    'If not approved, state the exact fixes required before the run can continue.',
  ].filter(Boolean).join('\n\n');
}

function getAgentRunArtifactContent(sessionId: string) {
  return getLatestAssistantContent(sessionId);
}

function getLatestAssistantContent(sessionId: string) {
  const session = useSessionStore.getState().sessions.get(sessionId);
  if (!session) return '';
  const assistantMessages = session.messages.filter((message) => message.role === 'assistant');
  for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
    const content = (assistantMessages[index]?.segments || [])
      .filter((segment) => segment.type === 'text')
      .map((segment) => segment.content)
      .join('')
      .trim();
    if (content) {
      return content;
    }
  }
  return '';
}

function formatAssignmentBrief(brief: AssignmentBrief) {
  return [
    `Title: ${brief.title}`,
    `Why now: ${brief.whyNow}`,
    `Goal: ${brief.goal}`,
    brief.context.length ? `Context:\n- ${brief.context.join('\n- ')}` : null,
    brief.inputArtifacts.length ? `Input artifacts:\n- ${brief.inputArtifacts.join('\n- ')}` : null,
    brief.instructions.length ? `Instructions:\n- ${brief.instructions.join('\n- ')}` : null,
    brief.acceptanceCriteria.length ? `Acceptance criteria:\n- ${brief.acceptanceCriteria.join('\n- ')}` : null,
    brief.deliverables.length ? `Deliverables:\n- ${brief.deliverables.join('\n- ')}` : null,
    `Target folder: ${brief.targetFolder}`,
    brief.expectedFiles.length ? `Expected files:\n- ${brief.expectedFiles.join('\n- ')}` : null,
    brief.reviewTargetPaths.length ? `Review target paths:\n- ${brief.reviewTargetPaths.join('\n- ')}` : null,
    brief.reviewFocus.length ? `Review focus:\n- ${brief.reviewFocus.join('\n- ')}` : null,
    brief.risks.length ? `Risks:\n- ${brief.risks.join('\n- ')}` : null,
  ].filter(Boolean).join('\n\n');
}

function guessArtifactKind(task: OrchestratorAgentTask): OrchestratorArtifact['kind'] {
  if (task.kind === 'review') return 'report';
  const name = `${task.title} ${task.summary || ''}`.toLowerCase();
  if (name.includes('draft') || name.includes('write')) return 'draft';
  if (name.includes('note')) return 'notes';
  return 'summary';
}

function buildArtifactLogicalKey(task: OrchestratorAgentTask) {
  const stageKey = task.stageId || 'stage';
  const kindKey = task.kind || task.nodeType;
  return `${stageKey}.${kindKey}`;
}

function buildExpectedFilePaths(brief: AssignmentBrief) {
  return brief.expectedFiles.map((file) => `${brief.targetFolder}/${file}`);
}

function buildArtifactSummary(task: OrchestratorAgentTask, content: string, filePaths: string[] = []) {
  if (containsToolCallMarkup(content)) {
    return filePaths[0] || task.summary || `${task.agentName || task.title} output`;
  }
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean);
  return firstLine || filePaths[0] || task.summary || `${task.agentName || task.title} output`;
}

function parseReviewDecision(content: string, reviewedArtifactCount = 0) {
  const normalized = content.toLowerCase();
  if (
    containsAgentError(content)
    || containsToolCallMarkup(content)
    || reviewedArtifactCount === 0
  ) {
    return {
      decision: 'needs_changes' as const,
      summary: containsAgentError(content)
        ? 'Review could not complete successfully because the agent output contained an execution error.'
        : containsToolCallMarkup(content)
          ? 'Review did not return a final decision after attempting a tool call.'
        : 'Review requested changes because no reviewed artifacts were attached to this stage.',
    };
  }
  if (
    normalized.includes('needs changes')
    || normalized.includes('need changes')
    || normalized.includes('requires changes')
    || normalized.includes('需要修改')
    || normalized.includes('需修改')
    || normalized.includes('打回')
  ) {
    return {
      decision: 'needs_changes' as const,
      summary: 'Review requested changes before the stage can continue.',
    };
  }
  if (
    normalized.includes('"decision":"approved"')
    || normalized.includes('"decision": "approved"')
    || normalized.includes('\ndecision: approved')
    || normalized.includes('decision: approved')
    || normalized.includes('final decision: approved')
    || normalized.includes('审核通过')
    || normalized.includes('通过审核')
  ) {
    return {
      decision: 'approved' as const,
      summary: 'Review approved this stage output.',
    };
  }
  if (
    normalized.includes('reject')
    || normalized.includes('rejected')
    || normalized.includes('不通过')
    || normalized.includes('未通过')
  ) {
    return {
      decision: 'rejected' as const,
      summary: 'Review rejected this stage output.',
    };
  }
  return {
    decision: 'needs_changes' as const,
    summary: 'Review did not return an explicit final decision.',
  };
}

function containsAgentError(content: string) {
  const normalized = content.toLowerCase();
  return normalized.includes('[error:')
    || normalized.includes('llm error:')
    || normalized.includes('error sending request')
    || normalized.includes('api.minimaxi.com');
}

function containsToolCallMarkup(content: string) {
  const normalized = content.toLowerCase();
  return normalized.includes('<minimax:tool_call>')
    || normalized.includes('<invoke name=')
    || normalized.includes('<invoke name name=');
}

function isTransientAgentFailure(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('error decoding response body')
    || normalized.includes('error sending request')
    || normalized.includes('connection reset')
    || normalized.includes('too many requests')
    || normalized.includes('429')
    || normalized.includes('model stream ended unexpectedly')
    || normalized.includes('timed out')
    || normalized.includes('timeout');
}

function isLiveTask(task: OrchestratorAgentTask) {
  if (task.nodeType === 'container') return false;
  return task.status === 'ready' || isActiveTask(task);
}

async function deriveRunStatusFromTasks(ctx: PluginContext, run: OrchestratorRun) {
  if (['completed', 'cancelled', 'failed', 'pause_requested', 'paused'].includes(run.status)) {
    return run;
  }
  const tasks = await listTasksForRun(ctx, run.id);
  const hasWaitingHuman = tasks.some((task) => task.status === 'waiting_human' || task.requiresHumanApproval);
  const hasWaitingReview = tasks.some((task) => task.status === 'waiting_review');
  if (hasWaitingHuman) {
    return {
      ...run,
      status: 'waiting_human' as const,
      pendingHumanCheckpoint: run.pendingHumanCheckpoint || tasks.find((task) => task.status === 'waiting_human')?.blockedReason || 'Human action required before the run can continue.',
      pausedAt: run.pausedAt || Date.now(),
      engineHealthSummary: run.engineHealthSummary || 'Run is waiting for human action.',
      updatedAt: Date.now(),
    };
  }
  if (hasWaitingReview && run.activeTaskCount === 0) {
    return {
      ...run,
      status: 'waiting_review' as const,
      pendingHumanCheckpoint: undefined,
      engineHealthSummary: 'Run is waiting for review before it can continue.',
      updatedAt: Date.now(),
    };
  }
  if (run.status === 'waiting_review' || run.status === 'waiting_human') {
    return {
      ...run,
      status: 'running' as const,
      pendingHumanCheckpoint: undefined,
      pausedAt: undefined,
      updatedAt: Date.now(),
    };
  }
  return run;
}

function summarizeReviewDecision(
  decision: 'approved' | 'needs_changes' | 'rejected',
  isHumanOverride = false,
) {
  const prefix = isHumanOverride ? 'Human review' : 'Review';
  if (decision === 'approved') return `${prefix} approved this stage output.`;
  if (decision === 'needs_changes') return `${prefix} requested changes before the stage can continue.`;
  return `${prefix} rejected this stage output.`;
}

function buildHumanOverrideFeedback(
  decision: 'approved' | 'needs_changes' | 'rejected',
  task: OrchestratorAgentTask,
) {
  if (decision === 'approved') {
    return `${task.stageName || task.title} was approved by a human reviewer.`;
  }
  if (decision === 'needs_changes') {
    return `${task.stageName || task.title} needs changes before execution can continue.`;
  }
  return `${task.stageName || task.title} was rejected by a human reviewer.`;
}

function summarizeProjectState(projectState: OrchestratorProjectState | null) {
  if (!projectState || projectState.entries.length === 0) return [];
  return [
    ...projectState.entries.map((entry) => `${entry.label}: ${entry.summary}`),
    ...(projectState.structureSummary || []),
    ...(projectState.dependencySummary || []),
  ];
}

export async function listReviewedArtifacts(
  ctx: PluginContext,
  runId: string,
  parentTaskId: string,
  reviewTargetPaths?: string[],
) {
  if (!parentTaskId) return [];
  const tasks = await listTasksForRun(ctx, runId);
  const artifacts = await listArtifactsForRun(ctx, runId);
  const workTaskIds = tasks
    .filter((candidate) => candidate.parentTaskId === parentTaskId && candidate.kind === 'work')
    .map((candidate) => candidate.id);
  const targetPathSet = new Set((reviewTargetPaths || []).filter(Boolean));
  const draftArtifacts = artifacts.filter((artifact) =>
    ['draft', 'review_submitted'].includes(artifact.status)
    && workTaskIds.includes(artifact.taskId)
    && (
      targetPathSet.size === 0
      || artifact.filePaths.some((path) => targetPathSet.has(path))
    ),
  );
  const latestByLogicalKey = new Map<string, OrchestratorArtifact>();
  for (const artifact of draftArtifacts) {
    const existing = latestByLogicalKey.get(artifact.logicalKey);
    if (
      !existing
      || artifact.updatedAt > existing.updatedAt
      || (
        artifact.updatedAt === existing.updatedAt
        && artifact.createdAt > existing.createdAt
      )
    ) {
      latestByLogicalKey.set(artifact.logicalKey, artifact);
    }
  }
  return Array.from(latestByLogicalKey.values()).sort((a, b) => a.createdAt - b.createdAt);
}

async function acceptStageArtifacts(
  ctx: PluginContext,
  runId: string,
  parentTaskId: string,
  reviewLogId: string,
  now: number,
) {
  const tasks = await listTasksForRun(ctx, runId);
  const stageTasks = tasks.filter((task) => task.parentTaskId === parentTaskId && task.kind === 'work');
  const artifacts = await listArtifactsForRun(ctx, runId);
  const targetArtifacts = artifacts.filter((artifact) => stageTasks.some((task) => task.id === artifact.taskId));

  for (const artifact of targetArtifacts) {
    for (const existing of artifacts.filter((item) => item.id !== artifact.id && item.logicalKey === artifact.logicalKey && item.status === 'accepted')) {
      await updateArtifact(ctx, existing.id, (current) => ({
        ...current,
        status: 'superseded',
        updatedAt: now,
      }));
    }
    if (artifact.status === 'draft' || artifact.status === 'review_submitted') {
      await updateArtifact(ctx, artifact.id, (current) => ({
        ...current,
        status: 'accepted',
        acceptedByReviewLogId: reviewLogId,
        updatedAt: now,
      }));
    }
  }

  await rebuildProjectState(ctx, runId, now);
}

async function markArtifactsUnderReview(ctx: PluginContext, artifactIds: string[], now: number) {
  await Promise.all(artifactIds.map((artifactId) => updateArtifact(ctx, artifactId, (current) => ({
    ...current,
    status: current.status === 'accepted' ? current.status : 'review_submitted',
    updatedAt: now,
  }))));
}

async function rejectReviewedArtifacts(ctx: PluginContext, artifactIds: string[], now: number) {
  await Promise.all(artifactIds.map((artifactId) => updateArtifact(ctx, artifactId, (current) => ({
    ...current,
    status: current.status === 'accepted' ? current.status : 'rejected',
    updatedAt: now,
  }))));
}

function buildRunFailureState(
  run: OrchestratorRun,
  input: {
    kind: OrchestratorFailureKind;
    summary: string;
    retryable: boolean;
    requiresHuman: boolean;
    recommendedAction: string;
    autoRetryAt?: number;
    taskId?: string;
    agentRunId?: string;
    runtime?: StreamRuntime;
  },
  now: number,
) {
  return {
    kind: input.kind,
    summary: input.summary,
    retryable: input.retryable,
    requiresHuman: input.requiresHuman,
    recommendedAction: input.recommendedAction,
    autoRetryAt: input.autoRetryAt,
    taskId: input.taskId,
    agentRunId: input.agentRunId,
    runtime: input.runtime,
    firstOccurredAt: run.failureState?.firstOccurredAt || now,
    lastOccurredAt: now,
    retryCount: (run.failureState?.retryCount || 0) + 1,
  };
}

async function rebuildProjectState(ctx: PluginContext, runId: string, now: number) {
  const artifacts = await listArtifactsForRun(ctx, runId);
  const acceptedArtifacts = artifacts.filter((artifact) => artifact.status === 'accepted');
  const current = await getProjectState(ctx, runId);
  const entries = acceptedArtifacts.map((artifact) => ({
    id: `${artifact.id}:entry`,
    logicalKey: artifact.logicalKey,
    label: artifact.name,
    artifactId: artifact.id,
    artifactKind: artifact.kind,
    filePaths: artifact.filePaths,
    stageId: artifact.stageId,
    stageName: artifact.stageName,
    summary: artifact.summary,
    updatedAt: artifact.updatedAt,
  }));
  const nextState: OrchestratorProjectState = {
    runId,
    entries,
    structureSummary: acceptedArtifacts.map((artifact) => `${artifact.stageName || 'Stage'} -> ${artifact.filePaths.join(', ') || artifact.summary}`),
    dependencySummary: acceptedArtifacts.map((artifact) => `${artifact.logicalKey} depends on review ${artifact.acceptedByReviewLogId || 'none'}`),
    updatedAt: now,
  };
  if (!current || JSON.stringify(current.entries) !== JSON.stringify(nextState.entries) || current.updatedAt !== nextState.updatedAt) {
    await saveProjectState(ctx, nextState);
  }
}

function startCoordinatorRunSession(
  ctx: PluginContext,
  run: OrchestratorRun,
  coordinatorRun: OrchestratorCoordinatorRun,
  candidates: Dispatch[],
) {
  return launchAgentSession({
    sessionId: coordinatorRun.sessionId,
    title: coordinatorRun.title,
    prompt: coordinatorRun.prompt,
    parentSessionId: run.sourceSessionId,
    executionContext: run.executionContext,
    allowedTools: ORCHESTRATOR_COORDINATOR_ALLOWED_TOOLS,
    onStarted: async () => {
      const now = Date.now();
      await updateCoordinatorRun(ctx, coordinatorRun.id, (current) => ({
        ...current,
        status: 'running',
        startedAt: now,
        lastEventAt: now,
        updatedAt: now,
      }));
      ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
    },
    onChunk: async (chunk) => {
      const now = Date.now();
      await updateCoordinatorRun(ctx, coordinatorRun.id, (current) => ({
        ...current,
        runtime: chunk.type === 'runtime_status'
          ? {
              state: chunk.state,
              reason: chunk.reason,
              message: chunk.message,
              attempt: chunk.attempt,
              retryAt: chunk.retryAt,
              retryInSeconds: chunk.retryInSeconds,
              updatedAt: now,
            }
          : current.runtime,
        lastEventAt: now,
        updatedAt: now,
      }));
      if (chunk.type === 'runtime_status') {
        await syncRunRuntimeFromAgent(ctx, run.id, {
          state: chunk.state,
          reason: chunk.reason,
          message: chunk.message,
          attempt: chunk.attempt,
          retryAt: chunk.retryAt,
          retryInSeconds: chunk.retryInSeconds,
          updatedAt: now,
        }, { agentRunId: coordinatorRun.id, label: 'Orchestrator agent' });
      }
    },
    onCompleted: async () => {
      try {
        const latestCoordinatorRun = (await listCoordinatorRunsForRun(ctx, run.id)).find((item) => item.id === coordinatorRun.id);
        if (latestCoordinatorRun?.status === 'completed' || latestCoordinatorRun?.status === 'failed') {
          return;
        }
        const raw = getLatestAssistantContent(coordinatorRun.sessionId);
        const currentRun = await getRun(ctx, run.id);
        if (!currentRun) {
          return;
        }
        const currentTasks = await listTasksForRun(ctx, run.id);
        const currentReviewLogs = await listReviewLogsForRun(ctx, run.id);
        const currentProjectState = await getProjectState(ctx, run.id);
        const currentArtifacts = await listArtifactsForRun(ctx, run.id);
        const currentContext: OrchestrationContext = {
          run: currentRun,
          wakeReason: coordinatorRun.wakeReason,
          tasks: currentTasks,
          reviewLogs: currentReviewLogs,
          projectState: currentProjectState,
          artifacts: currentArtifacts,
          activeTaskCount: currentTasks.filter((task) => isLiveTask(task)).length,
          availableSlots: Math.max(0, (currentRun.maxConcurrentTasks || 2) - currentTasks.filter((task) => isLiveTask(task)).length),
        };
        const decision = parseOrchestrationDecisionJson(raw, currentContext, candidates);
        await saveRun(ctx, {
          ...currentRun,
          activeTaskCount: Math.max(0, currentRun.activeTaskCount - 1),
          updatedAt: Date.now(),
        });
        await applyOrchestratorDecision(ctx, run.id, coordinatorRun.id, decision);
      } catch (error) {
        const now = Date.now();
        const message = error instanceof Error ? error.message : String(error);
        const latestCoordinatorRun = (await listCoordinatorRunsForRun(ctx, run.id)).find((item) => item.id === coordinatorRun.id);
        if (latestCoordinatorRun?.status === 'completed') {
          return;
        }
        await updateCoordinatorRun(ctx, coordinatorRun.id, (current) => ({
          ...current,
          status: 'failed',
          error: message,
          lastEventAt: now,
          updatedAt: now,
        }));
        const failedRun = await getRun(ctx, run.id);
        if (failedRun) {
          const transientRetryScheduled = await scheduleTransientFailureRecovery(
            ctx,
            failedRun,
            { kind: 'coordinator', coordinatorRun },
            message,
            now,
          );
          if (transientRetryScheduled) {
            return;
          }
          await saveRun(ctx, {
            ...failedRun,
            status: 'paused',
            pausedAt: now,
            activeTaskCount: Math.max(0, failedRun.activeTaskCount - 1),
            failureState: buildRunFailureState(failedRun, {
              kind: 'agent_runtime_error',
              summary: message,
              retryable: true,
              requiresHuman: true,
              recommendedAction: 'Inspect the coordinator failure, then resume the run when it is safe to continue.',
              agentRunId: coordinatorRun.id,
            }, now),
            lastDecisionAt: now,
            lastDecisionSummary: 'Orchestrator agent failed and the run was paused.',
            engineHealthSummary: message,
            updatedAt: now,
          });
          await appendRunEvent(ctx, {
            id: createId('evt'),
            runId: run.id,
            type: 'run.updated',
            title: 'Orchestrator agent failed',
            detail: message,
            createdAt: now,
          });
          ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
        }
      }
    },
    onFailed: async (error) => {
      const now = Date.now();
      const message = error instanceof Error ? error.message : String(error);
      const latestCoordinatorRun = (await listCoordinatorRunsForRun(ctx, run.id)).find((item) => item.id === coordinatorRun.id);
      if (latestCoordinatorRun?.status === 'completed') {
        return;
      }
      await updateCoordinatorRun(ctx, coordinatorRun.id, (current) => ({
        ...current,
        status: 'failed',
        error: message,
        lastEventAt: now,
        updatedAt: now,
      }));
      const failedRun = await getRun(ctx, run.id);
      if (failedRun) {
        const transientRetryScheduled = await scheduleTransientFailureRecovery(
          ctx,
          failedRun,
          { kind: 'coordinator', coordinatorRun },
          message,
          now,
        );
        if (transientRetryScheduled) {
          return;
        }
        await saveRun(ctx, {
          ...failedRun,
          status: 'paused',
          pausedAt: now,
          activeTaskCount: Math.max(0, failedRun.activeTaskCount - 1),
          failureState: buildRunFailureState(failedRun, {
            kind: 'agent_runtime_error',
            summary: message,
            retryable: true,
            requiresHuman: true,
            recommendedAction: 'Inspect the coordinator failure, then resume the run when it is safe to continue.',
            agentRunId: coordinatorRun.id,
          }, now),
          lastDecisionAt: now,
          lastDecisionSummary: 'Orchestrator agent failed and the run was paused.',
          engineHealthSummary: message,
          updatedAt: now,
        });
        await appendRunEvent(ctx, {
          id: createId('evt'),
          runId: run.id,
          type: 'run.updated',
          title: 'Orchestrator agent failed',
          detail: message,
          createdAt: now,
        });
        ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
      }
    },
    onInterrupted: async () => {
      const now = Date.now();
      await updateCoordinatorRun(ctx, coordinatorRun.id, (current) => ({
        ...current,
        status: 'paused',
        lastEventAt: now,
        updatedAt: now,
      }));
      const currentRun = await getRun(ctx, run.id);
      if (currentRun) {
        await saveRun(ctx, {
          ...currentRun,
          activeTaskCount: Math.max(0, currentRun.activeTaskCount - 1),
          updatedAt: now,
        });
        ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
      }
    },
  });
}

export async function recoverOrchestratorRun(ctx: PluginContext, runId: string) {
  const run = await getRun(ctx, runId);
  if (!run || run.status === 'completed' || run.status === 'cancelled') return run;
  if (run.failureState?.retryable && !run.failureState.requiresHuman && run.failureState.autoRetryAt && run.failureState.taskId) {
    scheduleAutomaticRetry(ctx, run.id, run.failureState.taskId, run.failureState.autoRetryAt);
    return run;
  }
  if (run.failureState?.retryable && !run.failureState.requiresHuman && run.failureState.autoRetryAt && run.failureState.agentRunId) {
    scheduleAutomaticRunResume(ctx, run.id, run.failureState.autoRetryAt);
    return run;
  }
  if (run.status === 'waiting_human' || run.status === 'failed' || run.failureState?.requiresHuman) {
    return run;
  }
  const tasks = await listTasksForRun(ctx, run.id);
  const agentRuns = await listAgentRunsForRun(ctx, run.id);
  const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);

  if (run.currentOrchestratorAgentRunId) {
    const coordinatorRun = coordinatorRuns.find((item) => item.id === run.currentOrchestratorAgentRunId);
    if (
      coordinatorRun
      && ['pending', 'running'].includes(coordinatorRun.status)
      && run.status === 'running'
      && !isAgentSessionActive(coordinatorRun.sessionId)
    ) {
      const dispatchCandidates = buildDispatchCandidates(run.confirmedPlan, tasks).candidates;
      void startCoordinatorRunSession(ctx, run, coordinatorRun, dispatchCandidates);
      return run;
    }
  }

  for (const agentRun of agentRuns) {
    const task = tasks.find((item) => item.id === agentRun.taskId);
    if (!task) continue;
    if (!isLiveTask(task)) continue;
  if (!['running', 'waiting_review'].includes(run.status)) continue;
    if (isAgentSessionActive(agentRun.sessionId)) continue;
    if (task.status === 'running' || agentRun.status === 'running') {
      continue;
    }
    void launchDetachedAgentRunSession(ctx, run, task, agentRun, {
      title: `${agentRun.agentName || agentRun.title} · ${agentRun.stageName || 'Recovered'}`,
      prompt: `Resume the following orchestration assignment.\n\n${agentRun.prompt}`,
      startedDetail: `${agentRun.agentName || agentRun.title} resumed after recovery.`,
      preserveStartedAt: true,
    });
  }

  const refreshedRun = await getRun(ctx, run.id);
  if (refreshedRun && ['running', 'waiting_review'].includes(refreshedRun.status) && refreshedRun.activeTaskCount === 0) {
    return wakeOrchestratorRun(ctx, refreshedRun, { runId: refreshedRun.id, reason: 'system' });
  }
  return refreshedRun;
}

export async function watchdogOrchestratorRun(ctx: PluginContext, runId: string) {
  const run = await getRun(ctx, runId);
  if (!run) return null;

  const now = Date.now();
  if (run.failureState && run.failureState.requiresHuman) {
    const nextRun: OrchestratorRun = {
      ...run,
      watchdogStatus: 'paused',
      watchdogCheckedAt: now,
      updatedAt: now,
    };
    await saveRun(ctx, nextRun);
    return nextRun;
  }
  if (!['running', 'pause_requested', 'waiting_review'].includes(run.status)) {
    const nextRun: OrchestratorRun = {
      ...run,
      watchdogStatus: run.status === 'cancelled' ? 'cancelled' : 'paused',
      watchdogCheckedAt: now,
      updatedAt: now,
    };
    await saveRun(ctx, nextRun);
    return nextRun;
  }

  const tasks = await listTasksForRun(ctx, run.id);
  const agentRuns = await listAgentRunsForRun(ctx, run.id);
  const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);
  const activeTasks = tasks.filter((task) => isLiveTask(task));
  const activeCoordinatorRun = run.currentOrchestratorAgentRunId
    ? coordinatorRuns.find((item) => item.id === run.currentOrchestratorAgentRunId)
    : null;
  const staleAgentRun = activeTasks
    .map((task) => agentRuns.find((agentRun) => agentRun.taskId === task.id))
    .find((agentRun) => agentRun && now - (agentRun.lastEventAt || agentRun.updatedAt || 0) > MAX_WATCHDOG_IDLE_MS);
  const coordinatorIsStale = activeCoordinatorRun
    && ['pending', 'running'].includes(activeCoordinatorRun.status)
    && now - (activeCoordinatorRun.lastEventAt || activeCoordinatorRun.updatedAt || 0) > MAX_WATCHDOG_IDLE_MS;

  if (!staleAgentRun && !coordinatorIsStale) {
    if (run.watchdogStatus !== 'healthy' || !run.watchdogCheckedAt) {
      const nextRun: OrchestratorRun = {
        ...run,
        watchdogStatus: 'healthy',
        watchdogWarning: undefined,
        watchdogCheckedAt: now,
        updatedAt: now,
      };
      await saveRun(ctx, nextRun);
      ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
      return nextRun;
    }
    return run;
  }

  const warning = coordinatorIsStale
    ? `${activeCoordinatorRun!.title} has been idle for more than ${Math.round(MAX_WATCHDOG_IDLE_MS / 60000)} minutes.`
    : `${staleAgentRun!.agentName || staleAgentRun!.title} has been idle for more than ${Math.round(MAX_WATCHDOG_IDLE_MS / 60000)} minutes.`;
  const nextRun: OrchestratorRun = {
    ...run,
    status: 'paused',
    pausedAt: now,
    activeTaskCount: activeTasks.length,
    failureState: buildRunFailureState(run, {
      kind: 'environment_unavailable',
      summary: warning,
      retryable: true,
      requiresHuman: true,
      recommendedAction: 'Inspect the stalled session, then resume the run after the environment is healthy again.',
      agentRunId: activeCoordinatorRun?.id || staleAgentRun?.id,
    }, now),
    watchdogStatus: 'stalled',
    watchdogWarning: warning,
    watchdogCheckedAt: now,
    lastDecisionAt: now,
    lastDecisionSummary: warning,
    engineHealthSummary: 'Watchdog paused the run because an agent stopped producing events.',
    updatedAt: now,
  };
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'run.updated',
    title: 'Watchdog paused the run',
    detail: warning,
    createdAt: now,
  });
  if (coordinatorIsStale && activeCoordinatorRun?.sessionId) {
    await interruptAgentSession(activeCoordinatorRun.sessionId);
  } else if (staleAgentRun?.sessionId) {
    await interruptAgentSession(staleAgentRun.sessionId);
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
  return nextRun;
}

function rewriteAgentPrompt(prompt: string, summary: string) {
  return `${prompt}\n\nHuman update:\n${summary}`;
}

function startAgentRunSession(
  ctx: PluginContext,
  run: OrchestratorRun,
  task: OrchestratorAgentTask,
  agentRun: OrchestratorAgentRun,
  options: {
    title: string;
    prompt: string;
    startedDetail: string;
    preserveStartedAt?: boolean;
  },
) {
  return launchAgentSession({
    sessionId: agentRun.sessionId,
    title: options.title,
    prompt: options.prompt,
    parentSessionId: run.sourceSessionId,
    executionContext: run.executionContext,
    allowedTools: agentRun.kind === 'review'
      ? ORCHESTRATOR_REVIEW_AGENT_ALLOWED_TOOLS
      : ORCHESTRATOR_WORK_AGENT_ALLOWED_TOOLS,
    onStarted: async () => {
      const now = Date.now();
      await updateTask(ctx, task.id, (current) => ({
        ...current,
        status: 'running',
        updatedAt: now,
      }));
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'running',
        startedAt: options.preserveStartedAt ? current.startedAt || now : now,
        lastEventAt: now,
        updatedAt: now,
      }));
      await appendRunEvent(ctx, {
        id: createId('evt'),
        runId: run.id,
        type: 'task.updated',
        title: 'Agent started',
        detail: options.startedDetail,
        createdAt: now,
      });
      ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
    },
    onChunk: async (chunk) => {
      const now = Date.now();
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        runtime: chunk.type === 'runtime_status'
          ? {
              state: chunk.state,
              reason: chunk.reason,
              message: chunk.message,
              attempt: chunk.attempt,
              retryAt: chunk.retryAt,
              retryInSeconds: chunk.retryInSeconds,
              updatedAt: now,
            }
          : current.runtime,
        lastEventAt: now,
        updatedAt: now,
      }));
      if (chunk.type === 'runtime_status') {
        await syncRunRuntimeFromAgent(ctx, run.id, {
          state: chunk.state,
          reason: chunk.reason,
          message: chunk.message,
          attempt: chunk.attempt,
          retryAt: chunk.retryAt,
          retryInSeconds: chunk.retryInSeconds,
          updatedAt: now,
        }, {
          taskId: task.id,
          agentRunId: agentRun.id,
          label: task.agentName || task.title,
        });
      }
    },
    onCompleted: async () => {
      const now = Date.now();
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'completed',
        completedAt: now,
        lastEventAt: now,
        updatedAt: now,
      }));
      await completeOrchestratorTask(ctx, { taskId: task.id });
    },
    onFailed: async (error) => {
      const now = Date.now();
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        lastEventAt: now,
        updatedAt: now,
      }));
      await failOrchestratorTask(ctx, task.id, error);
    },
    onInterrupted: async () => {
      await interruptOrchestratorTask(ctx, task.id);
    },
  });
}

async function launchDetachedAgentRunSession(
  ctx: PluginContext,
  run: OrchestratorRun,
  task: OrchestratorAgentTask,
  agentRun: OrchestratorAgentRun,
  options: {
    title: string;
    prompt: string;
    startedDetail: string;
    preserveStartedAt?: boolean;
  },
) {
  try {
    await startAgentRunSession(ctx, run, task, agentRun, options);
  } catch (error) {
    const now = Date.now();
    const message = error instanceof Error ? error.message : String(error);

    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'run.updated',
      title: 'Agent launch failed',
      detail: `${task.agentName || task.title} failed before streaming started: ${message}`,
      createdAt: now,
    });

    await updateAgentRun(ctx, agentRun.id, (current) => ({
      ...current,
      status: 'failed',
      error: message,
      lastEventAt: now,
      updatedAt: now,
    }));

    await failOrchestratorTask(ctx, task.id, `Agent launch failed: ${message}`);
  }
}
