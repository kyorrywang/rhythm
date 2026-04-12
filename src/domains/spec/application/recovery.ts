import { SPEC_AGENT_PROFILE_IDS } from '../infra/agents';
import type { SpecRuntimeContext } from '../domain/contracts';
import { classifyRecoveryIntent } from '../domain/stateMachine';
import { appendSpecTimelineEvent, loadSpecState, syncSpecStateFromDisk, updateSpecState } from '../infra/storage';
import { createSpecTimelineEvent } from '../infra/timeline';
import type { SpecMaintenanceLease } from '../domain/types';
import { buildSpecSnapshot, getActiveSpecRun, getSpecNow, createSpecId } from './orchestration';
import { reducePauseSpecRun, reduceResumeSpecRun } from './editor';
import { retrySpecTask } from './execution';

const MAINTENANCE_LEASE_TTL_MS = 30_000;
const activeLeaseOwners = new Map<string, string>();

export async function acquireSpecMaintenanceLease(ctx: SpecRuntimeContext, slug: string, runId: string) {
  const ownerId = ctx.ownerId || createSpecId('lease');
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

    const currentNow = getSpecNow(ctx);
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
    const state = await loadSpecState(ctx.workspacePath, slug);
    if (state) {
      await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
        state,
        type: 'lease.acquired',
        title: 'Maintenance lease acquired',
        detail: `Run ${runId} is now leased by ${ownerId}.`,
        runId,
        payload: { ownerId },
      }));
    }
  }

  return { acquired, ownerId };
}

export async function releaseSpecMaintenanceLease(ctx: SpecRuntimeContext, slug: string, runId: string, ownerId: string) {
  const leaseKey = `${ctx.workspacePath}:${slug}:${runId}`;
  const eventTime = getSpecNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => ({
    ...current,
    execution: {
      ...current.execution,
      maintenanceLeaseOwnerId: current.execution.maintenanceLeaseOwnerId === ownerId ? null : current.execution.maintenanceLeaseOwnerId,
    },
    runs: current.runs.map((run) => run.id === runId && run.maintenanceLease?.ownerId === ownerId
      ? {
        ...run,
        maintenanceLease: undefined,
        updatedAt: eventTime,
      }
      : run),
    updatedAt: eventTime,
  }));

  if (activeLeaseOwners.get(leaseKey) === ownerId) {
    activeLeaseOwners.delete(leaseKey);
  }

  await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
    state: nextState,
    type: 'lease.released',
    title: 'Maintenance lease released',
    detail: `Run ${runId} lease released by ${ownerId}.`,
    runId,
    payload: { ownerId },
    createdAt: eventTime,
  }));
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

export async function pauseSpecRun(ctx: SpecRuntimeContext, slug: string, runId: string, reason: string) {
  const eventTime = getSpecNow(ctx);
  let event = null;
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const transition = reducePauseSpecRun(current, reason, eventTime);
    event = transition.event;
    return transition.state;
  });
  if (event) {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, event);
  } else {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
      state: nextState,
      type: 'run.paused',
      title: 'Run paused',
      detail: reason,
      runId,
      createdAt: eventTime,
    }));
  }
  return nextState;
}

export async function resumeSpecRun(ctx: SpecRuntimeContext, slug: string, runId: string) {
  const eventTime = getSpecNow(ctx);
  let event = null;
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const transition = reduceResumeSpecRun(current, eventTime);
    event = transition.event;
    return transition.state;
  });
  if (event) {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, event);
  } else {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
      state: nextState,
      type: 'run.resumed',
      title: 'Run resumed',
      detail: 'Spec run resumed.',
      runId,
      createdAt: eventTime,
    }));
  }
  return nextState;
}

export async function recoverSpecRun(ctx: SpecRuntimeContext, slug: string, runId: string) {
  return withSpecMaintenanceLease(
    ctx,
    slug,
    runId,
    async () => loadSpecState(ctx.workspacePath, slug),
    async () => {
      const state = await loadSpecState(ctx.workspacePath, slug);
      if (!state) {
        return null;
      }

      const snapshot = buildSpecSnapshot(state);
      if (!snapshot.activeRun) {
        return state;
      }

      const recoveryIntent = classifyRecoveryIntent(snapshot);
      const eventTime = getSpecNow(ctx);
      const nextState = await updateSpecState(ctx, slug, (current) => {
        const activeRun = getActiveSpecRun(current);
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
            activeAgentProfileId: nextStatus === 'running' ? SPEC_AGENT_PROFILE_IDS.orchestrator : null,
          },
          runs: current.runs.map((run) => run.id === activeRun.id
            ? {
              ...run,
              status: nextStatus,
              engineHealthSummary: nextSummary,
              watchdogStatus: nextStatus === 'paused' ? 'paused' : 'healthy',
              updatedAt: eventTime,
            }
            : run),
          updatedAt: eventTime,
        };
      });

      await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
        state: nextState,
        type: 'run.updated',
        title: 'Recovery evaluated',
        detail: recoveryIntent.reason,
        runId,
        payload: { strategy: recoveryIntent.strategy },
        createdAt: eventTime,
      }));
      return nextState;
    },
  );
}

export async function heartbeatSpecMaintenanceLease(ctx: SpecRuntimeContext, slug: string, runId: string, ownerId: string) {
  const eventTime = getSpecNow(ctx);
  return updateSpecState(ctx, slug, (current) => ({
    ...current,
    runs: current.runs.map((run) => run.id === runId && run.maintenanceLease?.ownerId === ownerId
      ? {
        ...run,
        maintenanceLease: {
          ...run.maintenanceLease,
          heartbeatAt: eventTime,
          expiresAt: eventTime + MAINTENANCE_LEASE_TTL_MS,
        },
        watchdogCheckedAt: eventTime,
        updatedAt: eventTime,
      }
      : run),
    updatedAt: eventTime,
  }));
}

export async function watchdogSpecRun(ctx: SpecRuntimeContext, slug: string, runId: string) {
  return withSpecMaintenanceLease(
    ctx,
    slug,
    runId,
    async () => loadSpecState(ctx.workspacePath, slug),
    async (ownerId) => {
      await heartbeatSpecMaintenanceLease(ctx, slug, runId, ownerId);
      const synced = await syncSpecStateFromDisk(ctx, slug);
      const run = synced.runs.find((item) => item.id === runId);
      if (!run) {
        return synced;
      }
      if (run.failureState?.retryable && run.failureState.autoRetryAt && run.failureState.autoRetryAt <= getSpecNow(ctx) && run.failureState.taskId) {
        return retrySpecTask(ctx, slug, run.failureState.taskId, 'Watchdog triggered automatic retry.');
      }
      if (run.status === 'interrupted' || run.status === 'pause_requested') {
        return recoverSpecRun(ctx, slug, runId);
      }
      return updateSpecState(ctx, slug, (current) => ({
        ...current,
        runs: current.runs.map((item) => item.id === runId
          ? {
            ...item,
            watchdogStatus: item.status === 'waiting_human' ? 'warning' : item.watchdogStatus,
            watchdogWarning: item.status === 'waiting_human' ? 'Run is waiting on human input.' : undefined,
            watchdogCheckedAt: getSpecNow(ctx),
            updatedAt: getSpecNow(ctx),
          }
          : item),
        updatedAt: getSpecNow(ctx),
      }));
    },
  );
}
