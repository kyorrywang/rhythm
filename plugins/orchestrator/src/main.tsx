import { definePlugin } from '../../../src/plugin/sdk';
import { registerOrchestratorCommands } from './commands';
import { OrchestratorPanel } from './components/OrchestratorPanel';
import { RunView } from './components/RunView';
import { TemplateView } from './components/TemplateView';
import { ORCHESTRATOR_VIEWS } from './constants';
import { registerOrchestratorToolActions } from './toolActions';
import type { OrchestratorRunPayload, OrchestratorTemplatePayload } from './types';

export default definePlugin({
  activate(ctx) {
    registerOrchestratorCommands(ctx);
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

    ctx.ui.workbench.register<OrchestratorRunPayload>({
      id: ORCHESTRATOR_VIEWS.run,
      title: 'Run',
      component: RunView,
    });
  },
});
