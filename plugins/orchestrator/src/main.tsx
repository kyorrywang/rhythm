import { definePlugin } from '../../../src/plugin/sdk';
import { registerOrchestratorCommands } from './commands';
import { AgentSessionView } from './components/AgentSessionView';
import { OrchestratorPanel } from './components/OrchestratorPanel';
import { PlanDraftView } from './components/PlanDraftView';
import { RunView } from './components/RunView';
import { TemplateView } from './components/TemplateView';
import { ORCHESTRATOR_VIEWS } from './constants';
import { registerOrchestratorMessageActions } from './messageActions';
import { listRuns } from './storage';
import { recoverOrchestratorRun, watchdogOrchestratorRun } from './runtime';
import { registerOrchestratorToolActions } from './toolActions';
import type { OrchestratorAgentRunPayload, OrchestratorPlanDraftPayload, OrchestratorRunPayload, OrchestratorTemplatePayload } from './types';

let watchdogTimer: number | null = null;

export default definePlugin({
  activate(ctx) {
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

    let disposed = false;
    const recoverAll = async () => {
      const runs = await listRuns(ctx);
      for (const run of runs) {
        if (disposed) return;
        if (run.status === 'running' || run.status === 'pause_requested') {
          await recoverOrchestratorRun(ctx, run.id);
          await watchdogOrchestratorRun(ctx, run.id);
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
    if (watchdogTimer !== null) {
      window.clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  },
});
