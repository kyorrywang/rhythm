import type { LeftPanelProps } from '../../../src/plugin/sdk';
import type { ToolCall } from '../../../src/shared/types/schema';
import { ORCHESTRATOR_VIEWS } from './constants';
import type { OrchestratorPlanDraft, OrchestratorRun, OrchestratorTemplate } from './types';

export function registerOrchestratorToolActions(ctx: LeftPanelProps['ctx']) {
  ctx.ui.toolResultActions.register({
    id: 'orchestrator.openPlanDraftFromTool',
    title: 'Open Plan Draft',
    description: 'Open the plan draft returned by this tool.',
    order: 10,
    when: ({ tool }) =>
      tool.name === 'orchestrator.createPlanDraft'
      || tool.name === 'orchestrator.createPlanDraftFromSession'
      || tool.name === 'orchestrator.getPlanDraft'
      || tool.name === 'orchestrator.updatePlanDraft',
    run: ({ ctx, tool }) => {
      const planDraft = parseJsonResult<OrchestratorPlanDraft>(tool);
      if (!planDraft?.id) return;
      ctx.ui.workbench.open({
        id: `orchestrator.plan-draft:${planDraft.id}`,
        viewId: ORCHESTRATOR_VIEWS.planDraft,
        title: planDraft.title || 'Plan Draft',
        description: planDraft.status,
        payload: { planDraft },
        layoutMode: 'replace',
      });
    },
  });

  ctx.ui.toolResultActions.register({
    id: 'orchestrator.openRunFromTool',
    title: 'Open Run',
    description: 'Open the orchestrator run returned by this tool.',
    order: 10,
    when: ({ tool }) =>
      tool.name === 'orchestrator.confirmPlanDraft'
      || tool.name === 'orchestrator.getRun'
      || tool.name === 'orchestrator.wakeRun'
      || tool.name === 'orchestrator.pauseRun'
      || tool.name === 'orchestrator.resumeRun'
      || tool.name === 'orchestrator.cancelRun'
      || tool.name === 'orchestrator.overrideReview',
    run: ({ ctx, tool }) => {
      const run = parseJsonResult<OrchestratorRun>(tool);
      if (!run?.id) return;
      ctx.ui.workbench.open({
        id: `orchestrator.run:${run.id}`,
        viewId: ORCHESTRATOR_VIEWS.run,
        title: run.goal || 'Run',
        description: run.planTitle,
        payload: { run },
        layoutMode: 'replace',
      });
    },
  });

  ctx.ui.toolResultActions.register({
    id: 'orchestrator.openTemplateFromTool',
    title: 'Open Template',
    description: 'Open the orchestrator template returned by this tool.',
    order: 10,
    when: ({ tool }) =>
      tool.name === 'orchestrator.createTemplate'
      || tool.name === 'orchestrator.createSampleNovelTemplate'
      || tool.name === 'orchestrator.createSampleSoftwareTemplate'
      || tool.name === 'orchestrator.updateTemplate'
      || tool.name === 'orchestrator.duplicateTemplate',
    run: ({ ctx, tool }) => {
      const template = parseJsonResult<OrchestratorTemplate>(tool);
      if (!template?.id) return;
      ctx.ui.workbench.open({
        id: `orchestrator.template:${template.id}`,
        viewId: ORCHESTRATOR_VIEWS.template,
        title: template.name || 'Template',
        description: template.domain,
        payload: { template },
        layoutMode: 'replace',
      });
    },
  });
}

function parseJsonResult<T>(tool: ToolCall): T | null {
  if (!tool.result) return null;
  try {
    const parsed = JSON.parse(tool.result) as { ok?: boolean; data?: T } | T;
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return (parsed as { data?: T }).data || null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}
