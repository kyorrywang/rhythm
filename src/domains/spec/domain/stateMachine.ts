import type { SpecOrchestrationAction, SpecRecoveryIntent } from './contracts';
import type { SpecChangeStatus, SpecRun, SpecRunStatus, SpecRuntimeSnapshot, SpecTask, SpecTaskStatus } from './types';

export const SPEC_CHANGE_STATUS_TRANSITIONS: Record<SpecChangeStatus, SpecChangeStatus[]> = {
  draft: ['planned', 'cancelled', 'archived'],
  planned: ['ready', 'cancelled', 'archived'],
  ready: ['running', 'cancelled', 'archived'],
  running: ['waiting_review', 'waiting_human', 'paused', 'completed', 'failed', 'cancelled'],
  waiting_review: ['running', 'waiting_human', 'paused', 'failed', 'cancelled', 'completed'],
  waiting_human: ['running', 'paused', 'failed', 'cancelled', 'completed'],
  paused: ['running', 'cancelled', 'failed'],
  completed: ['archived'],
  cancelled: ['archived'],
  failed: ['paused', 'running', 'cancelled', 'archived'],
  archived: [],
};

export const SPEC_RUN_STATUS_TRANSITIONS: Record<SpecRunStatus, SpecRunStatus[]> = {
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

export const SPEC_TASK_STATUS_TRANSITIONS: Record<SpecTaskStatus, SpecTaskStatus[]> = {
  pending: ['ready', 'cancelled', 'blocked'],
  ready: ['running', 'waiting_human', 'blocked', 'cancelled', 'failed', 'completed'],
  running: ['waiting_review', 'waiting_human', 'paused', 'completed', 'failed', 'cancelled', 'blocked'],
  blocked: ['ready', 'waiting_human', 'cancelled', 'failed'],
  waiting_review: ['running', 'waiting_human', 'completed', 'cancelled', 'failed'],
  waiting_human: ['ready', 'running', 'completed', 'cancelled', 'failed'],
  paused: ['ready', 'running', 'cancelled', 'failed'],
  completed: [],
  failed: ['ready', 'cancelled'],
  cancelled: [],
  interrupted: ['paused', 'failed', 'cancelled'],
};

export function canTransitionChangeStatus(from: SpecChangeStatus, to: SpecChangeStatus) {
  return SPEC_CHANGE_STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionRunStatus(from: SpecRunStatus, to: SpecRunStatus) {
  return SPEC_RUN_STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionTaskStatus(from: SpecTaskStatus, to: SpecTaskStatus) {
  return SPEC_TASK_STATUS_TRANSITIONS[from].includes(to);
}

export function getReadyLeafTasks(tasks: SpecTask[]) {
  return tasks.filter((task) => task.nodeType === 'leaf' && task.status === 'ready');
}

export function getLiveTasks(tasks: SpecTask[]) {
  return tasks.filter((task) => ['running', 'waiting_review', 'waiting_human', 'blocked', 'paused'].includes(task.status));
}

export function deriveRunStatusFromTasks(run: SpecRun, tasks: SpecTask[]): SpecRunStatus {
  if (run.status === 'cancelled' || run.status === 'completed' || run.status === 'failed') {
    return run.status;
  }
  if (tasks.some((task) => task.status === 'waiting_human')) return 'waiting_human';
  if (tasks.some((task) => task.status === 'waiting_review')) return 'waiting_review';
  if (tasks.some((task) => task.status === 'running')) return 'running';
  if (tasks.some((task) => task.status === 'paused')) return 'paused';
  if (tasks.length > 0 && tasks.every((task) => task.status === 'completed' || task.status === 'cancelled')) return 'completed';
  return 'running';
}

export function computeLegalOrchestrationActions(snapshot: SpecRuntimeSnapshot): SpecOrchestrationAction[] {
  const { activeRun, readyTasks, pendingHumanTasks, pendingReviews, liveTasks, state } = snapshot;
  const blockingLiveTasks = liveTasks.filter((task) => task.status !== 'waiting_review');
  if (!activeRun) {
    return [];
  }
  if (activeRun.status === 'waiting_human' || pendingHumanTasks.length > 0) {
    return [{ type: 'request_human', reason: 'A task is waiting for human approval.', taskId: pendingHumanTasks[0]?.id }];
  }
  if ((activeRun.status === 'waiting_review' || pendingReviews.length > 0) && blockingLiveTasks.length === 0) {
    return [{
      type: 'dispatch_task',
      taskId: pendingReviews[0]?.id,
      profileId: 'spec-reviewer',
    }];
  }
  if (readyTasks.length > 0 && blockingLiveTasks.length === 0 && pendingReviews.length === 0) {
    const nextTask = readyTasks[0];
    return [{
      type: 'dispatch_task',
      taskId: nextTask.id,
      profileId: nextTask.kind === 'review' ? 'spec-reviewer' : 'spec-executor',
    }];
  }
  if (liveTasks.length === 0 && state.tasks.length > 0 && state.tasks.every((task) => task.status === 'completed' || task.status === 'cancelled')) {
    return [{ type: 'complete_change', summary: 'All tasks have settled.' }];
  }
  return [{ type: 'wait', reason: 'Execution is still in progress.' }];
}

export function classifyRecoveryIntent(snapshot: SpecRuntimeSnapshot): SpecRecoveryIntent {
  const { activeRun, liveTasks, pendingHumanTasks, pendingReviews, readyTasks } = snapshot;
  if (!activeRun) {
    return { runId: '', strategy: 'noop', reason: 'No active run exists.' };
  }
  if (activeRun.status === 'waiting_human' || pendingHumanTasks.length > 0) {
    return { runId: activeRun.id, strategy: 'wait_for_human', reason: 'A human gate is still unresolved.' };
  }
  if (activeRun.status === 'waiting_review' || pendingReviews.length > 0) {
    return { runId: activeRun.id, strategy: 'wait_for_review', reason: 'A review decision is still unresolved.' };
  }
  if (liveTasks.length > 0) {
    return { runId: activeRun.id, strategy: 'resume_task', reason: 'A task was previously active and should be resumed.' };
  }
  if (readyTasks.length > 0) {
    return { runId: activeRun.id, strategy: 'resume_coordinator', reason: 'There is ready work and no live task is blocking dispatch.' };
  }
  if (activeRun.status === 'completed') {
    return { runId: activeRun.id, strategy: 'complete_run', reason: 'The run is already completed.' };
  }
  return { runId: activeRun.id, strategy: 'noop', reason: 'No recovery action is currently needed.' };
}
