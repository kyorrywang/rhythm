import { SPEC_AGENT_PROFILE_IDS } from '../infra/agents';
import type {
  SpecApplyReviewerResultInput,
  SpecReviewerAssignment,
  SpecRuntimeContext,
} from '../domain/contracts';
import { deriveRunStatusFromTasks } from '../domain/stateMachine';
import { assertValidSpecReviewerResult } from '../domain/validation';
import { appendSpecTimelineEvent, updateSpecState } from '../infra/storage';
import { createSpecTimelineEvent } from '../infra/timeline';
import type { SpecReview, SpecRuntimeSnapshot, SpecTask } from '../domain/types';
import { createSpecId, getActiveSpecRun, getSpecNow } from './orchestration';

function unlockDependentTasks(tasks: SpecTask[], eventTime: number): SpecTask[] {
  const completedTaskIds = new Set(tasks.filter((task) => task.status === 'completed').map((task) => task.id));
  return tasks.map((task) => {
    if (!['pending', 'blocked', 'ready'].includes(task.status)) {
      return task;
    }
    if (!task.dependsOn.every((dependencyId) => completedTaskIds.has(dependencyId))) {
      return task;
    }
    return task.status === 'pending' || task.status === 'blocked'
      ? { ...task, status: 'ready' as const, blockedReason: undefined, updatedAt: eventTime }
      : task;
  });
}

function createReviewRecord(input: SpecApplyReviewerResultInput, eventTime: number): SpecReview {
  const artifactIds = input.state.artifacts
    .filter((artifact) => artifact.taskId === input.task.id && artifact.status !== 'superseded')
    .map((artifact) => artifact.id);

  return {
    id: createSpecId('spec_review'),
    changeId: input.state.change.id,
    runId: input.run.id,
    taskId: input.task.id,
    artifactIds,
    decision: input.result.decision,
    summary: input.result.summary,
    findings: input.result.findings,
    requiresRework: input.result.requiresRework,
    createdAt: eventTime,
  };
}

function createReworkTask(input: SpecApplyReviewerResultInput, eventTime: number): SpecTask {
  return {
    id: createSpecId('spec_task'),
    changeId: input.state.change.id,
    runId: input.run.id,
    parentTaskId: input.task.id,
    rootTaskId: input.task.rootTaskId,
    stageId: input.task.stageId,
    title: `Rework: ${input.task.title}`,
    kind: 'rework',
    nodeType: 'leaf',
    source: 'review_rework',
    status: 'ready',
    failurePolicy: input.task.failurePolicy,
    retryPolicy: input.task.retryPolicy,
    assignedAgentProfileId: null,
    attemptCount: 0,
    dependsOn: [],
    acceptanceCriteria: input.task.acceptanceCriteria,
    targetPaths: input.task.targetPaths,
    summary: input.result.summary,
    reviewRequired: true,
    createdAt: eventTime,
    updatedAt: eventTime,
  };
}

export function buildSpecReviewerAssignment(snapshot: SpecRuntimeSnapshot, taskId?: string): SpecReviewerAssignment | null {
  const run = snapshot.activeRun;
  const task = snapshot.state.tasks.find((item) => item.id === (taskId || run?.currentTaskId)) || snapshot.pendingReviews[0] || null;
  if (!run || !task) {
    return null;
  }
  return {
    role: 'reviewer',
    changeId: snapshot.state.change.id,
    runId: run.id,
    task,
    artifacts: snapshot.state.artifacts.filter((artifact) => artifact.taskId === task.id && artifact.status !== 'superseded'),
  };
}

export async function applySpecReviewerResult(
  ctx: SpecRuntimeContext,
  slug: string,
  input: SpecApplyReviewerResultInput,
) {
  assertValidSpecReviewerResult(input.result);
  const eventTime = getSpecNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const activeRun = getActiveSpecRun(current);
    const review = createReviewRecord({
      state: current,
      run: input.run,
      task: input.task,
      result: input.result,
    }, eventTime);

    const baseTasks: SpecTask[] = current.tasks.map((task) => {
      if (task.id !== input.task.id) {
        return task;
      }
      if (input.result.decision === 'accepted') {
        return {
          ...task,
          status: 'completed',
          summary: input.result.summary,
          updatedAt: eventTime,
        };
      }
      if (input.result.decision === 'human_required' || input.result.decision === 'blocked') {
        return {
          ...task,
          status: 'waiting_human' as const,
          blockedReason: input.result.summary,
          updatedAt: eventTime,
        };
      }
      return {
        ...task,
        status: 'completed',
        summary: `${input.result.summary} Rework task created.`,
        updatedAt: eventTime,
      };
    });

    const maybeReworkTask = input.result.decision === 'changes_requested' && input.result.requiresRework
      ? createReworkTask({
        state: current,
        run: input.run,
        task: input.task,
        result: input.result,
      }, eventTime)
      : null;

    const taskSet = maybeReworkTask ? [...baseTasks, maybeReworkTask] : baseTasks;
    const nextTasks = input.result.decision === 'accepted' ? unlockDependentTasks(taskSet, eventTime) : taskSet;
    const nextRunStatus = input.result.decision === 'human_required' || input.result.decision === 'blocked'
      ? 'waiting_human'
      : deriveRunStatusFromTasks(activeRun || input.run, nextTasks);
    const nextChangeStatus: typeof current.change.status = nextRunStatus === 'waiting_human'
      ? 'waiting_human'
      : nextRunStatus === 'completed'
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
      tasks: nextTasks,
      artifacts: current.artifacts.map((artifact) => artifact.taskId === input.task.id
        ? {
          ...artifact,
          status: input.result.decision === 'accepted'
            ? 'accepted'
            : input.result.decision === 'changes_requested'
              ? 'rejected'
              : artifact.status,
          updatedAt: eventTime,
        }
        : artifact),
      reviews: [...current.reviews, review],
      runs: current.runs.map((run) => run.id === (activeRun?.id || input.run.id)
        ? {
          ...run,
          status: nextRunStatus,
          currentTaskId: null,
          activeTaskCount: 0,
          pendingHumanAction: nextRunStatus === 'waiting_human'
            ? {
              kind: 'review_override',
              summary: input.result.summary,
              taskId: input.task.id,
              reviewId: review.id,
              requestedAt: eventTime,
            }
            : undefined,
          engineHealthSummary: input.result.summary,
          updatedAt: eventTime,
        }
        : run),
      execution: {
        ...current.execution,
        activeAgentProfileId: nextRunStatus === 'waiting_human' ? null : SPEC_AGENT_PROFILE_IDS.orchestrator,
      },
      updatedAt: eventTime,
    };
  });

  await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
    state: nextState,
    type: 'review.recorded',
    title: 'Review recorded',
    detail: input.result.summary,
    taskId: input.task.id,
    payload: { decision: input.result.decision, findings: input.result.findings.length },
    createdAt: eventTime,
  }));

  if (input.result.decision === 'changes_requested' && input.result.requiresRework) {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
      state: nextState,
      type: 'task.created',
      title: 'Rework task created',
      detail: `Rework was requested for ${input.task.title}.`,
      payload: { parentTaskId: input.task.id },
      createdAt: eventTime,
    }));
  }

  return nextState;
}
