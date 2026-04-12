import type { SpecArtifactProgress, SpecState, SpecTask, SpecTaskProgress } from './types';

export function computeSpecTaskMetrics(tasks: SpecTask[]): SpecTaskProgress {
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

export function computeSpecArtifactMetrics(state: SpecState): SpecArtifactProgress {
  return {
    accepted: state.artifacts.filter((artifact) => artifact.status === 'accepted').length,
    draft: state.artifacts.filter((artifact) => artifact.status === 'draft' || artifact.status === 'review_submitted').length,
    rejected: state.artifacts.filter((artifact) => artifact.status === 'rejected').length,
  };
}

export function refreshDerivedSpecState(state: SpecState, updatedAt = Date.now()): SpecState {
  const tasks = computeSpecTaskMetrics(state.tasks);
  const artifacts = computeSpecArtifactMetrics(state);
  const currentRun = state.runs.find((run) => run.id === state.change.currentRunId) || state.runs[state.runs.length - 1] || null;
  const currentTaskId = currentRun?.currentTaskId
    || state.tasks.find((task) => task.title === tasks.currentTaskTitle)?.id
    || null;

  return {
    ...state,
    change: {
      ...state.change,
      currentTaskId,
      updatedAt,
    },
    metrics: {
      tasks,
      artifacts,
    },
    updatedAt,
  };
}
