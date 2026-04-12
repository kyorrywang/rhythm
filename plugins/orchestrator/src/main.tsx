import { definePlugin } from '../../../src/plugin/sdk';
import type { PluginContext } from '../../../src/plugin/sdk';
import { registerOrchestratorCommands } from './commands';
import { AgentSessionView } from './components/AgentSessionView';
import { OrchestratorAgentSessionView } from './components/OrchestratorAgentSessionView';
import { OrchestratorPanel } from './components/OrchestratorPanel';
import { PlanDraftView } from './components/PlanDraftView';
import { RunView } from './components/RunView';
import { TemplateView } from './components/TemplateView';
import { ORCHESTRATOR_VIEWS } from './constants';
import { registerOrchestratorMessageActions } from './messageActions';
import { getRun, listRuns, saveRun, withRunLock } from '../../../src/spec/storage';
import { recoverOrchestratorRun, watchdogOrchestratorRun } from '../../../src/spec/runtime';
import { registerOrchestratorToolActions } from './toolActions';
import type { OrchestratorAgentRunPayload, OrchestratorCoordinatorRunPayload, OrchestratorPlanDraftPayload, OrchestratorRunPayload, OrchestratorTemplatePayload } from './types';

let watchdogTimer: number | null = null;
let orchestratorPluginActive = false;
const runMaintenanceInFlight = new Map<string, Promise<void>>();
const MAINTENANCE_LEASE_MS = 45_000;
const maintenanceOwnerId = `orchestrator-plugin-${Math.random().toString(36).slice(2, 10)}`;

async function acquireMaintenanceLease(ctx: PluginContext, runId: string) {
  return withRunLock(runId, async () => {
    const run = await getRun(ctx, runId);
    if (!run) return false;
    const now = Date.now();
    const lease = run.maintenanceLease;
    if (lease && lease.ownerId !== maintenanceOwnerId && lease.expiresAt > now) {
      return false;
    }
    await saveRun(ctx, {
      ...run,
      maintenanceLease: {
        ownerId: maintenanceOwnerId,
        acquiredAt: lease?.ownerId === maintenanceOwnerId ? lease.acquiredAt : now,
        heartbeatAt: now,
        expiresAt: now + MAINTENANCE_LEASE_MS,
      },
      updatedAt: run.updatedAt,
    });
    return true;
  });
}

async function releaseMaintenanceLease(ctx: PluginContext, runId: string) {
  await withRunLock(runId, async () => {
    const run = await getRun(ctx, runId);
    if (!run?.maintenanceLease || run.maintenanceLease.ownerId !== maintenanceOwnerId) return;
    await saveRun(ctx, {
      ...run,
      maintenanceLease: undefined,
      updatedAt: run.updatedAt,
    });
  });
}

export default definePlugin({
  activate(ctx) {
    orchestratorPluginActive = true;
    registerOrchestratorCommands(ctx);
    registerOrchestratorMessageActions(ctx);
    registerOrchestratorToolActions(ctx);

    ctx.ui.activityBar.register({
      id: 'orchestrator.activity',
      title: 'Orchestrator',
      icon: 'workflow',
      opens: ORCHESTRATOR_VIEWS.panel,
    });

    ctx.ui.leftPanel.register({
      id: ORCHESTRATOR_VIEWS.panel,
      title: 'Orchestrator',
      icon: 'workflow',
      component: OrchestratorPanel,
    });

    ctx.ui.workbench.register<OrchestratorTemplatePayload>({
      id: ORCHESTRATOR_VIEWS.template,
      title: 'Template',
      component: TemplateView,
    });

    ctx.ui.workbench.register<OrchestratorPlanDraftPayload>({
      id: ORCHESTRATOR_VIEWS.planDraft,
      title: 'Plan Draft',
      component: PlanDraftView,
    });

    ctx.ui.workbench.register<OrchestratorRunPayload>({
      id: ORCHESTRATOR_VIEWS.run,
      title: 'Run',
      component: RunView,
    });

    ctx.ui.workbench.register<OrchestratorAgentRunPayload>({
      id: ORCHESTRATOR_VIEWS.agentRun,
      title: 'Agent',
      component: AgentSessionView,
    });

    ctx.ui.workbench.register<OrchestratorCoordinatorRunPayload>({
      id: ORCHESTRATOR_VIEWS.orchestratorAgentRun,
      title: 'Orchestrator Agent',
      component: OrchestratorAgentSessionView,
    });

    const maintainRun = (runId: string) => {
      const existing = runMaintenanceInFlight.get(runId);
      if (existing) return existing;
      let next: Promise<void> | null = null;
      next = (async () => {
        try {
          if (!orchestratorPluginActive) return;
          const leaseAcquired = await acquireMaintenanceLease(ctx, runId);
          if (!leaseAcquired) return;
          await recoverOrchestratorRun(ctx, runId);
          if (!orchestratorPluginActive) return;
          await watchdogOrchestratorRun(ctx, runId);
        } finally {
          await releaseMaintenanceLease(ctx, runId);
          if (next && runMaintenanceInFlight.get(runId) === next) {
            runMaintenanceInFlight.delete(runId);
          }
        }
      })();
      runMaintenanceInFlight.set(runId, next);
      return next;
    };

    const recoverAll = async () => {
      if (!orchestratorPluginActive) return;
      const runs = await listRuns(ctx);
      for (const run of runs) {
        if (!orchestratorPluginActive) return;
        if (
          run.status === 'running'
          || run.status === 'pause_requested'
          || run.status === 'waiting_review'
          || (run.failureState?.retryable && !run.failureState.requiresHuman && Boolean(run.failureState.autoRetryAt))
        ) {
          await maintainRun(run.id);
        }
      }
    };

    void recoverAll();
    if (watchdogTimer !== null) {
      window.clearInterval(watchdogTimer);
    }
    watchdogTimer = window.setInterval(() => {
      void recoverAll();
    }, 30000);

  },
  deactivate() {
    orchestratorPluginActive = false;
    if (watchdogTimer !== null) {
      window.clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
    runMaintenanceInFlight.clear();
  },
});
