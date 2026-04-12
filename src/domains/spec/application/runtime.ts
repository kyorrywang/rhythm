import { SPEC_AGENT_PROFILE_IDS } from '../infra/agents';
import type { SpecApplyDecisionInput, SpecRuntimeContext } from '../domain/contracts';
import { appendSpecTimelineEvent, createSpecChange, loadSpecState, updateSpecState } from '../infra/storage';
import { classifyRecoveryIntent, computeLegalOrchestrationActions, deriveRunStatusFromTasks, getLiveTasks, getReadyLeafTasks } from '../domain/stateMachine';
import type { SpecArtifact, SpecMaintenanceLease, SpecRun, SpecRuntimeSnapshot, SpecState, SpecTimelineEvent } from '../domain/types';

const MAINTENANCE_LEASE_TTL_MS = 30_000;
const activeLeaseOwners = new Map<string, string>();

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function getNow(ctx: SpecRuntimeContext) {
  return ctx.now ? ctx.now() : Date.now();
}

function getActiveRun(state: SpecState) {
  return state.runs.find((run) => run.id === state.change.currentRunId) || state.runs.at(-1) || null;
}

function buildSnapshot(state: SpecState): SpecRuntimeSnapshot {
  const activeRun = getActiveRun(state);
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

function createTimelineEvent(state: SpecState, type: SpecTimelineEvent['type'], title: string, detail: string): SpecTimelineEvent {
  return {
    id: createId('evt'),
    changeId: state.change.id,
    runId: state.change.currentRunId || undefined,
    type,
    title,
    detail,
    createdAt: Date.now(),
  };
}

export async function initializeSpecChange(ctx: SpecRuntimeContext, input: Parameters<typeof createSpecChange>[1]) {
  return createSpecChange(ctx.workspacePath, input);
}

export async function getSpecSnapshot(ctx: SpecRuntimeContext, slug: string) {
  const state = await loadSpecState(ctx.workspacePath, slug);
  if (!state) return null;
  return buildSnapshot(state);
}

export async function acquireSpecMaintenanceLease(ctx: SpecRuntimeContext, slug: string, runId: string) {
  const ownerId = ctx.ownerId || createId('lease');
  const leaseKey = `${ctx.workspacePath}:${slug}:${runId}`;
  if (activeLeaseOwners.get(leaseKey) === ownerId) {
    return { acquired: true, ownerId };
  }

  let acquired = false;
  await updateSpecState(ctx, slug, (current) => {
    const run = current.runs.find((item) => item.id === runId);
    if (!run) {
      return current;
    }
    const currentNow = getNow(ctx);
    const existing = run.maintenanceLease;
    if (existing && existing.ownerId !== ownerId && existing.expiresAt > currentNow) {
      return current;
    }
    const nextLease: SpecMaintenanceLease = {
      ownerId,
      acquiredAt: existing?.ownerId === ownerId ? existing.acquiredAt : currentNow,
      heartbeatAt: currentNow,
      expiresAt: currentNow + MAINTENANCE_LEASE_TTL_MS,
    };
    acquired = true;
    return {
      ...current,
      execution: {
        ...current.execution,
        maintenanceLeaseOwnerId: ownerId,
      },
      runs: current.runs.map((item) => item.id === runId
        ? {
          ...item,
          maintenanceLease: nextLease,
          updatedAt: currentNow,
        }
        : item),
      updatedAt: currentNow,
    };
  });

  if (acquired) {
    activeLeaseOwners.set(leaseKey, ownerId);
  }
  return { acquired, ownerId };
}

export async function releaseSpecMaintenanceLease(ctx: SpecRuntimeContext, slug: string, runId: string, ownerId: string) {
  const leaseKey = `${ctx.workspacePath}:${slug}:${runId}`;
  await updateSpecState(ctx, slug, (current) => ({
    ...current,
    execution: {
      ...current.execution,
      maintenanceLeaseOwnerId: current.execution.maintenanceLeaseOwnerId === ownerId ? null : current.execution.maintenanceLeaseOwnerId,
    },
    runs: current.runs.map((run) => run.id === runId && run.maintenanceLease?.ownerId === ownerId
      ? {
        ...run,
        maintenanceLease: undefined,
        updatedAt: getNow(ctx),
      }
      : run),
    updatedAt: getNow(ctx),
  }));
  if (activeLeaseOwners.get(leaseKey) === ownerId) {
    activeLeaseOwners.delete(leaseKey);
  }
}

export async function withSpecMaintenanceLease<T>(
  ctx: SpecRuntimeContext,
  slug: string,
  runId: string,
  onUnavailable: () => Promise<T>,
  operation: (ownerId: string) => Promise<T>,
) {
  const leaseKey = `${ctx.workspacePath}:${slug}:${runId}`;
  const existingOwnerId = activeLeaseOwners.get(leaseKey);
  if (existingOwnerId) {
    return operation(existingOwnerId);
  }
  const { acquired, ownerId } = await acquireSpecMaintenanceLease(ctx, slug, runId);
  if (!acquired) {
    return onUnavailable();
  }
  try {
    return await operation(ownerId);
  } finally {
    await releaseSpecMaintenanceLease(ctx, slug, runId, ownerId);
  }
}

export async function computeSpecNextActions(ctx: SpecRuntimeContext, slug: string) {
  const snapshot = await getSpecSnapshot(ctx, slug);
  if (!snapshot) return [];
  return computeLegalOrchestrationActions(snapshot);
}

export async function startSpecRun(ctx: SpecRuntimeContext, slug: string) {
  const eventTime = getNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const currentRun = getActiveRun(current);
    const runId = currentRun?.id || createId('spec_run');
    const run: SpecRun = currentRun
      ? {
        ...currentRun,
        status: 'running',
        engineHealthSummary: 'Spec run started.',
        updatedAt: eventTime,
      }
      : {
        id: runId,
        changeId: current.change.id,
        status: 'running',
        currentStageId: null,
        currentTaskId: null,
        activeTaskCount: 0,
        engineHealthSummary: 'Spec run started.',
        watchdogStatus: 'healthy',
        createdAt: eventTime,
        updatedAt: eventTime,
      };
    return {
      ...current,
      change: {
        ...current.change,
        status: 'running',
        currentRunId: run.id,
        updatedAt: eventTime,
      },
      runs: currentRun ? current.runs.map((item) => item.id === currentRun.id ? run : item) : [...current.runs, run],
      execution: {
        ...current.execution,
        activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.orchestrator,
      },
      updatedAt: eventTime,
    };
  });

  await appendSpecTimelineEvent(ctx.workspacePath, slug, createTimelineEvent(nextState, 'run.started', 'Run started', 'Spec execution has started.'));
  return nextState;
}

function applyActionToState(input: SpecApplyDecisionInput) {
  const eventTime = Date.now();
  const { state, run, decision } = input;
  const action = decision.action;
  if (action.type === 'dispatch_task') {
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
          currentTaskId: action.taskId,
          activeTaskCount: Math.max(1, item.activeTaskCount),
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
        updatedAt: eventTime,
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

export async function applySpecOrchestratorDecision(ctx: SpecRuntimeContext, slug: string, input: SpecApplyDecisionInput) {
  const nextState = await updateSpecState(ctx, slug, () => applyActionToState(input));
  const eventType = input.decision.action.type === 'complete_change'
    ? 'run.completed'
    : input.decision.action.type === 'request_human'
      ? 'run.updated'
      : input.decision.action.type === 'wait'
        ? 'run.updated'
        : 'task.dispatched';
  await appendSpecTimelineEvent(ctx.workspacePath, slug, createTimelineEvent(nextState, eventType, 'Decision applied', input.decision.summary));
  return nextState;
}

export async function recordSpecArtifacts(ctx: SpecRuntimeContext, slug: string, artifacts: SpecArtifact[]) {
  const nextState = await updateSpecState(ctx, slug, (current) => ({
    ...current,
    artifacts: [...current.artifacts, ...artifacts],
    updatedAt: getNow(ctx),
  }));
  await appendSpecTimelineEvent(ctx.workspacePath, slug, createTimelineEvent(nextState, 'artifact.recorded', 'Artifacts recorded', `${artifacts.length} artifact(s) recorded.`));
  return nextState;
}

export async function completeSpecTask(ctx: SpecRuntimeContext, slug: string, taskId: string, summary: string) {
  const eventTime = getNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const activeRun = getActiveRun(current);
    const nextTasks = current.tasks.map((task) => task.id === taskId
      ? {
        ...task,
        status: task.reviewRequired ? 'waiting_review' : 'completed',
        summary,
        updatedAt: eventTime,
      }
      : task);
    return {
      ...current,
      tasks: nextTasks,
      runs: current.runs.map((run) => run.id === activeRun?.id
        ? {
          ...run,
          status: deriveRunStatusFromTasks(run, nextTasks),
          activeTaskCount: Math.max(0, run.activeTaskCount - 1),
          currentTaskId: run.currentTaskId === taskId ? null : run.currentTaskId,
          updatedAt: eventTime,
        }
        : run),
      updatedAt: eventTime,
    };
  });
  await appendSpecTimelineEvent(ctx.workspacePath, slug, createTimelineEvent(nextState, 'task.completed', 'Task completed', summary));
  return nextState;
}

export async function pauseSpecRun(ctx: SpecRuntimeContext, slug: string, runId: string, reason: string) {
  const eventTime = getNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => ({
    ...current,
    change: {
      ...current.change,
      status: 'paused',
      updatedAt: eventTime,
    },
    runs: current.runs.map((run) => run.id === runId
      ? {
        ...run,
        status: 'paused',
        engineHealthSummary: reason,
        updatedAt: eventTime,
      }
      : run),
    updatedAt: eventTime,
  }));
  await appendSpecTimelineEvent(ctx.workspacePath, slug, createTimelineEvent(nextState, 'run.paused', 'Run paused', reason));
  return nextState;
}

export async function resumeSpecRun(ctx: SpecRuntimeContext, slug: string, runId: string) {
  const eventTime = getNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => ({
    ...current,
    change: {
      ...current.change,
      status: 'running',
      updatedAt: eventTime,
    },
    execution: {
      ...current.execution,
      activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.orchestrator,
    },
    runs: current.runs.map((run) => run.id === runId
      ? {
        ...run,
        status: 'running',
        pendingHumanAction: undefined,
        engineHealthSummary: 'Run resumed and waiting for the orchestrator.',
        updatedAt: eventTime,
      }
      : run),
    updatedAt: eventTime,
  }));
  await appendSpecTimelineEvent(ctx.workspacePath, slug, createTimelineEvent(nextState, 'run.resumed', 'Run resumed', 'Spec run resumed.'));
  return nextState;
}

export async function recoverSpecRun(ctx: SpecRuntimeContext, slug: string, runId: string) {
  return withSpecMaintenanceLease(
    ctx,
    slug,
    runId,
    async () => loadSpecState(ctx.workspacePath, slug),
    async () => {
      const snapshot = await getSpecSnapshot(ctx, slug);
      if (!snapshot?.activeRun) {
        return snapshot?.state || null;
      }
      const recoveryIntent = classifyRecoveryIntent(snapshot);
      const eventTime = getNow(ctx);
      const nextState = await updateSpecState(ctx, slug, (current) => {
        const activeRun = getActiveRun(current);
        if (!activeRun || activeRun.id !== runId) {
          return current;
        }
        let nextStatus = activeRun.status;
        let nextSummary = activeRun.engineHealthSummary;
        if (recoveryIntent.strategy === 'resume_coordinator') {
          nextStatus = 'running';
          nextSummary = 'Recovery determined the coordinator should resume dispatch.';
        } else if (recoveryIntent.strategy === 'resume_task') {
          nextStatus = 'running';
          nextSummary = 'Recovery determined a task should resume.';
        } else if (recoveryIntent.strategy === 'wait_for_human') {
          nextStatus = 'waiting_human';
          nextSummary = recoveryIntent.reason;
        } else if (recoveryIntent.strategy === 'wait_for_review') {
          nextStatus = 'waiting_review';
          nextSummary = recoveryIntent.reason;
        } else if (recoveryIntent.strategy === 'complete_run') {
          nextStatus = 'completed';
          nextSummary = recoveryIntent.reason;
        }
        return {
          ...current,
          change: {
            ...current.change,
            status: nextStatus === 'completed'
              ? 'completed'
              : nextStatus === 'waiting_human'
                ? 'waiting_human'
                : nextStatus === 'waiting_review'
                  ? 'waiting_review'
                  : 'running',
            updatedAt: eventTime,
          },
          execution: {
            ...current.execution,
            activeAgentProfileId: nextStatus === 'running' ? SPEC_AGENT_PROFILE_IDS.orchestrator : current.execution.activeAgentProfileId,
          },
          runs: current.runs.map((run) => run.id === activeRun.id
            ? {
              ...run,
              status: nextStatus,
              engineHealthSummary: nextSummary,
              watchdogStatus: nextStatus === 'completed' ? 'healthy' : run.watchdogStatus,
              updatedAt: eventTime,
            }
            : run),
          updatedAt: eventTime,
        };
      });
      await appendSpecTimelineEvent(ctx.workspacePath, slug, createTimelineEvent(nextState, 'run.updated', 'Recovery evaluated', recoveryIntent.reason));
      return nextState;
    },
  );
}
