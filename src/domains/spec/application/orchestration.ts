import { SPEC_AGENT_PROFILE_IDS } from '../infra/agents';
import type {
  SpecApplyDecisionInput,
  SpecChangeScaffoldInput,
  SpecOrchestratorAssignment,
  SpecOrchestratorDecision,
  SpecRuntimeContext,
} from '../domain/contracts';
import { computeLegalOrchestrationActions, getLiveTasks, getReadyLeafTasks } from '../domain/stateMachine';
import { assertValidSpecOrchestratorDecision } from '../domain/validation';
import { appendSpecTimelineEvent, createSpecChange, loadSpecState, updateSpecState } from '../infra/storage';
import { createSpecTimelineEvent } from '../infra/timeline';
import type { SpecRuntimeSnapshot, SpecState } from '../domain/types';
import { reduceStartSpecRun } from './editor';

export function createSpecId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getSpecNow(ctx: SpecRuntimeContext) {
  return ctx.now ? ctx.now() : Date.now();
}

export function getActiveSpecRun(state: SpecState) {
  return state.runs.find((run) => run.id === state.change.currentRunId) || state.runs[state.runs.length - 1] || null;
}

export function buildSpecSnapshot(state: SpecState): SpecRuntimeSnapshot {
  const activeRun = getActiveSpecRun(state);
  return {
    state,
    activeRun,
    currentTask: state.tasks.find((task) => task.id === activeRun?.currentTaskId) || null,
    readyTasks: getReadyLeafTasks(state.tasks),
    liveTasks: getLiveTasks(state.tasks),
    pendingReviews: state.tasks.filter((task) => task.status === 'waiting_review'),
    pendingHumanTasks: state.tasks.filter((task) => task.status === 'waiting_human'),
  };
}

export async function initializeSpecChange(ctx: SpecRuntimeContext, input: SpecChangeScaffoldInput) {
  return createSpecChange(ctx.workspacePath, input);
}

export async function getSpecSnapshot(ctx: SpecRuntimeContext, slug: string) {
  const state = await loadSpecState(ctx.workspacePath, slug);
  if (!state) return null;
  return buildSpecSnapshot(state);
}

export async function computeSpecNextActions(ctx: SpecRuntimeContext, slug: string) {
  const snapshot = await getSpecSnapshot(ctx, slug);
  if (!snapshot) return [];
  return computeLegalOrchestrationActions(snapshot);
}

export function buildSpecOrchestratorAssignment(snapshot: SpecRuntimeSnapshot): SpecOrchestratorAssignment | null {
  if (!snapshot.activeRun) {
    return null;
  }
  return {
    role: 'orchestrator',
    changeId: snapshot.state.change.id,
    runId: snapshot.activeRun.id,
    runStatus: snapshot.activeRun.status,
    changeStatus: snapshot.state.change.status,
    currentTaskId: snapshot.activeRun.currentTaskId,
    legalActions: computeLegalOrchestrationActions(snapshot),
    readyTaskIds: snapshot.readyTasks.map((task) => task.id),
    pendingReviewTaskIds: snapshot.pendingReviews.map((task) => task.id),
    pendingHumanTaskIds: snapshot.pendingHumanTasks.map((task) => task.id),
  };
}

export async function startSpecRun(ctx: SpecRuntimeContext, slug: string) {
  const eventTime = getSpecNow(ctx);
  let event = null;
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const transition = reduceStartSpecRun(current, eventTime);
    event = transition.event;
    return transition.state;
  });

  if (event) {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, event);
  } else {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
      state: nextState,
      type: 'run.started',
      title: 'Run started',
      detail: 'Spec execution has started.',
      createdAt: eventTime,
    }));
  }
  return nextState;
}

function applyActionToState(state: SpecState, runId: string, decision: SpecOrchestratorDecision, eventTime: number): SpecState {
  const run = state.runs.find((item) => item.id === runId);
  if (!run) {
    return state;
  }
  const action = decision.action;
  if (action.type === 'dispatch_task') {
    const targetTask = state.tasks.find((task) => task.id === action.taskId) || null;
    return {
      ...state,
      change: {
        ...state.change,
        status: 'running',
        currentTaskId: action.taskId,
        updatedAt: eventTime,
      },
      execution: {
        ...state.execution,
        activeAgentProfileId: action.profileId,
      },
      tasks: state.tasks.map((task) => task.id === action.taskId
        ? {
          ...task,
          status: 'running',
          assignedAgentProfileId: action.profileId,
          runId: run.id,
          updatedAt: eventTime,
        }
        : task),
      runs: state.runs.map((item) => item.id === run.id
        ? {
          ...item,
          status: 'running',
          currentStageId: targetTask?.stageId || item.currentStageId,
          currentTaskId: action.taskId,
          activeTaskCount: 1,
          lastWakeAt: eventTime,
          lastWakeReason: 'system',
          updatedAt: eventTime,
        }
        : item),
      updatedAt: eventTime,
    };
  }

  if (action.type === 'request_human') {
    return {
      ...state,
      change: {
        ...state.change,
        status: 'waiting_human',
        currentTaskId: action.taskId || state.change.currentTaskId,
        updatedAt: eventTime,
      },
      execution: {
        ...state.execution,
        activeAgentProfileId: null,
      },
      runs: state.runs.map((item) => item.id === run.id
        ? {
          ...item,
          status: 'waiting_human',
          pendingHumanAction: {
            kind: 'failure_recovery',
            summary: action.reason,
            taskId: action.taskId,
            requestedAt: eventTime,
          },
          activeTaskCount: 0,
          updatedAt: eventTime,
        }
        : item),
      updatedAt: eventTime,
    };
  }

  if (action.type === 'complete_change') {
    return {
      ...state,
      change: {
        ...state.change,
        status: 'completed',
        currentTaskId: null,
        updatedAt: eventTime,
      },
      execution: {
        ...state.execution,
        activeAgentProfileId: null,
      },
      runs: state.runs.map((item) => item.id === run.id
        ? {
          ...item,
          status: 'completed',
          currentTaskId: null,
          activeTaskCount: 0,
          engineHealthSummary: action.summary,
          updatedAt: eventTime,
        }
        : item),
      updatedAt: eventTime,
    };
  }

  return {
    ...state,
    execution: {
      ...state.execution,
      activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.orchestrator,
    },
    runs: state.runs.map((item) => item.id === run.id
      ? {
        ...item,
        engineHealthSummary: action.reason,
        updatedAt: eventTime,
      }
      : item),
    updatedAt: eventTime,
  };
}

export async function applySpecOrchestratorDecision(
  ctx: SpecRuntimeContext,
  slug: string,
  input: SpecApplyDecisionInput,
) {
  const snapshot = buildSpecSnapshot(input.state);
  assertValidSpecOrchestratorDecision(input.decision, snapshot);
  const eventTime = getSpecNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => applyActionToState(current, input.run.id, input.decision, eventTime));
  const eventType = input.decision.action.type === 'complete_change'
    ? 'run.completed'
    : input.decision.action.type === 'request_human'
      ? 'run.updated'
      : input.decision.action.type === 'wait'
        ? 'run.updated'
        : 'task.dispatched';
  await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
    state: nextState,
    type: eventType,
    title: 'Decision applied',
    detail: input.decision.summary,
    taskId: input.decision.action.type === 'dispatch_task' ? input.decision.action.taskId : undefined,
    payload: { decision: input.decision as SpecOrchestratorDecision },
    createdAt: eventTime,
  }));
  return nextState;
}
