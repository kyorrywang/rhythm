import { SPEC_AGENT_PROFILE_IDS } from '../infra/agents';
import type {
  SpecApplyExecutorResultInput,
  SpecExecutorAssignment,
  SpecRuntimeContext,
} from '../domain/contracts';
import { deriveRunStatusFromTasks } from '../domain/stateMachine';
import { assertValidSpecExecutorResult } from '../domain/validation';
import { appendSpecTimelineEvent, updateSpecState } from '../infra/storage';
import { createSpecTimelineEvent } from '../infra/timeline';
import type { SpecArtifact, SpecFailureKind, SpecRuntimeSnapshot, SpecTask } from '../domain/types';
import { createSpecId, getActiveSpecRun, getSpecNow } from './orchestration';
import { reduceApproveHumanTask, reduceRetrySpecTask } from './editor';

function unlockDependentTasks(tasks: SpecTask[], eventTime: number): SpecTask[] {
  const completedTaskIds = new Set(tasks.filter((task) => task.status === 'completed').map((task) => task.id));
  return tasks.map((task) => {
    if (!['pending', 'blocked', 'ready'].includes(task.status)) {
      return task;
    }
    const allDepsSettled = task.dependsOn.every((dependencyId) => completedTaskIds.has(dependencyId));
    if (!allDepsSettled) {
      return task.status === 'ready'
        ? { ...task, status: 'pending' as const, updatedAt: eventTime }
        : task;
    }
    return task.status === 'pending' || task.status === 'blocked'
      ? { ...task, status: 'ready' as const, blockedReason: undefined, updatedAt: eventTime }
      : task;
  });
}

function createArtifactsFromExecutorResult(input: SpecApplyExecutorResultInput, eventTime: number) {
  return input.result.artifactDrafts.map<SpecArtifact>((artifactDraft, index) => ({
    id: createSpecId('spec_artifact'),
    changeId: input.state.change.id,
    runId: input.run.id,
    taskId: input.task.id,
    stageId: input.task.stageId,
    kind: 'task_output',
    status: input.task.reviewRequired ? 'review_submitted' : 'accepted',
    logicalKey: artifactDraft.logicalKey,
    name: artifactDraft.name,
    filePaths: artifactDraft.filePaths,
    summary: artifactDraft.summary,
    version: input.state.artifacts.filter((artifact) => artifact.logicalKey === artifactDraft.logicalKey).length + index + 1,
    createdAt: eventTime,
    updatedAt: eventTime,
  }));
}

export function buildSpecExecutorAssignment(snapshot: SpecRuntimeSnapshot, taskId?: string): SpecExecutorAssignment | null {
  const run = snapshot.activeRun;
  const task = snapshot.state.tasks.find((item) => item.id === (taskId || run?.currentTaskId));
  if (!run || !task) {
    return null;
  }
  return {
    role: 'executor',
    changeId: snapshot.state.change.id,
    runId: run.id,
    task,
    stage: snapshot.state.plan.stages.find((stage) => stage.id === task.stageId) || null,
    acceptedArtifacts: snapshot.state.artifacts.filter((artifact) => artifact.status === 'accepted'),
  };
}

export async function recordSpecArtifacts(ctx: SpecRuntimeContext, slug: string, artifacts: SpecArtifact[]) {
  const eventTime = getSpecNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => ({
    ...current,
    artifacts: [...current.artifacts, ...artifacts],
    updatedAt: eventTime,
  }));
  await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
    state: nextState,
    type: 'artifact.recorded',
    title: 'Artifacts recorded',
    detail: `${artifacts.length} artifact(s) recorded.`,
    payload: { artifactIds: artifacts.map((artifact) => artifact.id) },
    createdAt: eventTime,
  }));
  return nextState;
}

export async function applySpecExecutorResult(
  ctx: SpecRuntimeContext,
  slug: string,
  input: SpecApplyExecutorResultInput,
) {
  assertValidSpecExecutorResult(input.result, input.task);
  const eventTime = getSpecNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const activeRun = getActiveSpecRun(current);
    const nextArtifacts = createArtifactsFromExecutorResult({
      state: current,
      run: input.run,
      task: input.task,
      result: input.result,
    }, eventTime);
    const nextTasks: SpecTask[] = current.tasks.map((task) => {
      if (task.id !== input.task.id) {
        return task;
      }
      const nextStatus: SpecTask['status'] = task.reviewRequired ? 'waiting_review' : 'completed';
      return {
        ...task,
        status: nextStatus,
        summary: input.result.summary,
        attemptCount: task.attemptCount + 1,
        updatedAt: eventTime,
      };
    });
    const unlockedTasks = input.task.reviewRequired ? nextTasks : unlockDependentTasks(nextTasks, eventTime);
    const nextRunTasks = deriveRunStatusFromTasks(activeRun || input.run, unlockedTasks);
    const nextChangeStatus: typeof current.change.status = nextRunTasks === 'waiting_review'
      ? 'waiting_review'
      : nextRunTasks === 'completed'
        ? 'completed'
        : 'running';

    return {
      ...current,
      change: {
        ...current.change,
        status: nextChangeStatus,
        currentTaskId: null,
        updatedAt: eventTime,
      },
      tasks: unlockedTasks,
      artifacts: [...current.artifacts, ...nextArtifacts],
      runs: current.runs.map((run) => run.id === (activeRun?.id || input.run.id)
        ? {
          ...run,
          status: nextRunTasks,
          currentTaskId: null,
          activeTaskCount: 0,
          engineHealthSummary: input.result.summary,
          updatedAt: eventTime,
        }
        : run),
      execution: {
        ...current.execution,
        activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.orchestrator,
      },
      updatedAt: eventTime,
    };
  });

  await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
    state: nextState,
    type: 'artifact.recorded',
    title: 'Execution result recorded',
    detail: input.result.summary,
    taskId: input.task.id,
    payload: { logicalKeys: input.result.artifactDrafts.map((artifact) => artifact.logicalKey) },
    createdAt: eventTime,
  }));

  await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
    state: nextState,
    type: input.task.reviewRequired ? 'task.updated' : 'task.completed',
    title: input.task.reviewRequired ? 'Task submitted for review' : 'Task completed',
    detail: input.result.summary,
    taskId: input.task.id,
    createdAt: eventTime,
  }));

  return nextState;
}

export async function failSpecTask(
  ctx: SpecRuntimeContext,
  slug: string,
  taskId: string,
  failure: {
    kind: SpecFailureKind;
    summary: string;
    retryable?: boolean;
    requiresHuman?: boolean;
    recommendedAction?: string;
  },
) {
  const eventTime = getSpecNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const activeRun = getActiveSpecRun(current);
    const task = current.tasks.find((item) => item.id === taskId);
    if (!task || !activeRun) {
      return current;
    }
    const nextTaskStatus: SpecTask['status'] = failure.requiresHuman
      ? 'waiting_human'
      : task.failurePolicy === 'retry' && failure.retryable
        ? 'blocked'
        : task.failurePolicy === 'skip'
          ? 'completed'
          : 'failed';
    const nextRunStatus = failure.requiresHuman ? 'waiting_human' : nextTaskStatus === 'failed' ? 'failed' : activeRun.status;
    return {
      ...current,
      change: {
        ...current.change,
        status: nextRunStatus === 'failed' ? 'failed' : nextRunStatus === 'waiting_human' ? 'waiting_human' : current.change.status,
        currentTaskId: nextRunStatus === 'failed' ? null : current.change.currentTaskId,
        updatedAt: eventTime,
      },
      tasks: current.tasks.map((item) => item.id === taskId
        ? {
          ...item,
          status: nextTaskStatus,
          blockedReason: failure.summary,
          updatedAt: eventTime,
        }
        : item),
      runs: current.runs.map((run) => run.id === activeRun.id
        ? {
          ...run,
          status: nextRunStatus,
          currentTaskId: nextRunStatus === 'failed' ? null : run.currentTaskId,
          activeTaskCount: 0,
          pendingHumanAction: failure.requiresHuman
            ? {
              kind: 'failure_recovery',
              summary: failure.summary,
              taskId,
              requestedAt: eventTime,
            }
            : run.pendingHumanAction,
          failureState: {
            kind: failure.kind,
            summary: failure.summary,
            retryable: failure.retryable ?? false,
            requiresHuman: failure.requiresHuman ?? false,
            recommendedAction: failure.recommendedAction || (failure.requiresHuman ? 'Await human resolution.' : 'Retry or inspect the task output.'),
            autoRetryAt: task.retryPolicy === 'auto_transient' && (failure.retryable ?? false) ? eventTime + 5_000 : undefined,
            taskId,
            runId: run.id,
            firstOccurredAt: run.failureState?.taskId === taskId ? run.failureState.firstOccurredAt : eventTime,
            lastOccurredAt: eventTime,
            retryCount: (run.failureState?.taskId === taskId ? run.failureState.retryCount : task.attemptCount) + 1,
          },
          engineHealthSummary: failure.summary,
          updatedAt: eventTime,
        }
        : run),
      execution: {
        ...current.execution,
        activeAgentProfileId: failure.requiresHuman ? null : SPEC_AGENT_PROFILE_IDS.orchestrator,
      },
      updatedAt: eventTime,
    };
  });

  await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
    state: nextState,
    type: 'task.failed',
    title: 'Task failed',
    detail: failure.summary,
    taskId,
    createdAt: eventTime,
  }));
  return nextState;
}

export async function retrySpecTask(ctx: SpecRuntimeContext, slug: string, taskId: string, summary = 'Task retry requested.') {
  const eventTime = getSpecNow(ctx);
  let event = null;
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const transition = reduceRetrySpecTask(current, taskId, summary, eventTime);
    event = transition.event;
    return transition.state;
  });
  if (event) {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, event);
  } else {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
      state: nextState,
      type: 'task.updated',
      title: 'Task retried',
      detail: summary,
      taskId,
      createdAt: eventTime,
    }));
  }
  return nextState;
}

export async function approveSpecHumanTask(ctx: SpecRuntimeContext, slug: string, taskId: string, summary = 'Human gate approved.') {
  const eventTime = getSpecNow(ctx);
  let event = null;
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const transition = reduceApproveHumanTask(current, taskId, summary, eventTime);
    event = transition.event;
    return transition.state;
  });
  if (event) {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, event);
  } else {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
      state: nextState,
      type: 'task.updated',
      title: 'Human gate approved',
      detail: summary,
      taskId,
      createdAt: eventTime,
    }));
  }
  return nextState;
}

export async function completeSpecTask(ctx: SpecRuntimeContext, slug: string, taskId: string, summary: string) {
  const eventTime = getSpecNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const activeRun = getActiveSpecRun(current);
    const nextTasks = unlockDependentTasks(current.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }
      const nextStatus: SpecTask['status'] = task.reviewRequired ? 'waiting_review' : 'completed';
      return {
        ...task,
        status: nextStatus,
        summary,
        updatedAt: eventTime,
      };
    }), eventTime);
    return {
      ...current,
      tasks: nextTasks,
      runs: current.runs.map((run) => run.id === activeRun?.id
        ? {
          ...run,
          status: deriveRunStatusFromTasks(run, nextTasks),
          activeTaskCount: 0,
          currentTaskId: run.currentTaskId === taskId ? null : run.currentTaskId,
          updatedAt: eventTime,
        }
        : run),
      updatedAt: eventTime,
    };
  });
  await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
    state: nextState,
    type: 'task.completed',
    title: 'Task completed',
    detail: summary,
    taskId,
    createdAt: eventTime,
  }));
  return nextState;
}
