import type { PluginContext } from '../../../src/plugin/sdk';
import { useSessionStore } from '../../../src/shared/state/useSessionStore';
import { useWorkspaceStore } from '../../../src/shared/state/useWorkspaceStore';
import { ORCHESTRATOR_COMMANDS, ORCHESTRATOR_EVENTS, ORCHESTRATOR_VIEWS } from './constants';
import { appendRunEvent, deleteTemplate, getPlanDraft, getRun, getTemplate, listPlanDrafts, listRuns, listTasks, listTemplates, savePlanDraft, saveReviewPolicy, saveRun, saveTemplate } from './storage';
import { startOrchestratorRun, wakeRunById } from './runtime';
import type {
  OrchestratorCancelRunInput,
  OrchestratorCompleteTaskInput,
  OrchestratorConfirmPlanDraftInput,
  OrchestratorCreatePlanDraftFromSessionInput,
  OrchestratorCreatePlanDraftInput,
  OrchestratorCreateTemplateInput,
  OrchestratorDeleteTemplateInput,
  OrchestratorDuplicateTemplateInput,
  OrchestratorGetPlanDraftInput,
  OrchestratorGetRunInput,
  OrchestratorMatchTemplatesInput,
  OrchestratorOverrideReviewInput,
  OrchestratorPauseRunInput,
  OrchestratorPlanDraft,
  OrchestratorExecutionContext,
  OrchestratorRetryTaskInput,
  OrchestratorResumeRunInput,
  OrchestratorSkipTaskInput,
  OrchestratorUpdatePlanDraftInput,
  OrchestratorUpdateTaskInput,
  OrchestratorUpdateTemplateInput,
  OrchestratorWakeRunInput,
} from './types';
import {
  cloneTemplate,
  createPlanDraft,
  createDefaultTemplate,
  createConfirmedPlanFromDraft,
  createRunCreatedEvent,
  createRunFromPlan,
  createSampleNovelTemplate,
  createSampleSoftwareTemplate,
  matchTemplatesByGoal,
} from './utils';
import {
  completeOrchestratorTask,
  pauseOrchestratorRun,
  resumeOrchestratorRun,
  retryOrchestratorTask,
  skipOrchestratorTask,
  overrideReviewDecision,
  updateOrchestratorTask,
} from './runtime';
import { cancelOrchestratorRun } from './runtime';

export function registerOrchestratorCommands(ctx: PluginContext) {
  ctx.commands.register<OrchestratorCreatePlanDraftInput, OrchestratorPlanDraft>(
    ORCHESTRATOR_COMMANDS.createPlanDraft,
    async (input) => {
      const planDraft = createPlanDraft({
        ...input,
        sourceSessionId: input.sourceSessionId || useSessionStore.getState().activeSessionId || undefined,
      });
      await savePlanDraft(ctx, planDraft);
      ctx.events.emit(ORCHESTRATOR_EVENTS.planDraftsChanged, { planDraftId: planDraft.id });
      ctx.ui.workbench.open({
        id: `orchestrator.plan-draft:${planDraft.id}`,
        viewId: ORCHESTRATOR_VIEWS.planDraft,
        title: planDraft.title,
        description: 'Plan Draft',
        payload: { planDraft },
        layoutMode: 'replace',
      });
      return planDraft;
    },
    {
      title: 'Create Orchestrator Plan Draft',
      description: 'Create a plan draft before handing work to the orchestrator.',
    },
  );

  ctx.commands.register<OrchestratorCreatePlanDraftFromSessionInput, OrchestratorPlanDraft>(
    ORCHESTRATOR_COMMANDS.createPlanDraftFromSession,
    async ({ sessionId, messageId }) => {
      const session = useSessionStore.getState().sessions.get(sessionId);
      if (!session) throw new Error(`Session not found: ${sessionId}`);
      const latestUser = [...session.messages].reverse().find((message) => message.role === 'user');
      const referenceAssistant = messageId
        ? session.messages.find((message) => message.id === messageId)
        : [...session.messages].reverse().find((message) => message.role === 'assistant');
      const goal = latestUser?.content?.trim() || session.title || 'Untitled project';
      const overview = referenceAssistant?.content?.trim()
        || referenceAssistant?.segments?.filter((segment) => segment.type === 'text').map((segment) => segment.content).join('\n\n')
        || `根据主会话内容，为“${goal}”生成一份可确认的执行计划。`;
      const planDraft = createPlanDraft({
        title: goal,
        goal,
        overview,
        decompositionPrinciples: ['先用高层阶段明确推进方向，再在运行中按任务树逐步细化。'],
        humanCheckpoints: ['用户确认计划后才创建 run。'],
        reviewCheckpoints: ['每个主要阶段完成后需要经过审核。'],
        sourceSessionId: sessionId,
        sourceMessageId: messageId,
      });
      await savePlanDraft(ctx, planDraft);
      ctx.events.emit(ORCHESTRATOR_EVENTS.planDraftsChanged, { planDraftId: planDraft.id });
      ctx.ui.workbench.open({
        id: `orchestrator.plan-draft:${planDraft.id}`,
        viewId: ORCHESTRATOR_VIEWS.planDraft,
        title: planDraft.title,
        description: 'Plan Draft',
        payload: { planDraft },
        layoutMode: 'replace',
      });
      return planDraft;
    },
  );

  ctx.commands.register<OrchestratorUpdatePlanDraftInput, OrchestratorPlanDraft | null>(
    ORCHESTRATOR_COMMANDS.updatePlanDraft,
    async ({ planDraftId, patch }) => {
      const current = await getPlanDraft(ctx, planDraftId);
      if (!current) throw new Error(`Plan draft not found: ${planDraftId}`);
      if (current.status === 'confirmed') {
        const mutableAfterConfirm = new Set(['runId']);
        const attemptedProtectedChanges = Object.keys(patch).filter((key) => !mutableAfterConfirm.has(key));
        if (attemptedProtectedChanges.length > 0) {
          throw new Error('Confirmed plans are immutable. Create a new draft revision instead of editing the confirmed plan in place.');
        }
      }
      const planDraft: OrchestratorPlanDraft = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      await savePlanDraft(ctx, planDraft);
      ctx.events.emit(ORCHESTRATOR_EVENTS.planDraftsChanged, { planDraftId: planDraft.id });
      return planDraft;
    },
  );

  ctx.commands.register<OrchestratorGetPlanDraftInput, OrchestratorPlanDraft | null>(
    ORCHESTRATOR_COMMANDS.getPlanDraft,
    async ({ planDraftId }) => getPlanDraft(ctx, planDraftId),
  );

  ctx.commands.register(
    ORCHESTRATOR_COMMANDS.listPlanDrafts,
    async () => listPlanDrafts(ctx),
    {
      title: 'List Orchestrator Plan Drafts',
      description: 'List stored plan drafts.',
    },
  );

  ctx.commands.register<OrchestratorConfirmPlanDraftInput, unknown>(
    ORCHESTRATOR_COMMANDS.confirmPlanDraft,
    async ({ planDraftId }) => {
      const planDraft = await getPlanDraft(ctx, planDraftId);
      if (!planDraft) throw new Error(`Plan draft not found: ${planDraftId}`);
      const confirmedPlan: OrchestratorPlanDraft = {
        ...planDraft,
        status: 'confirmed',
        revision: Math.max(1, planDraft.revision || 1),
        confirmedAt: Date.now(),
        updatedAt: Date.now(),
      };
      await savePlanDraft(ctx, confirmedPlan);
      const confirmedSnapshot = createConfirmedPlanFromDraft(confirmedPlan);
      const baseRun = createRunFromPlan(confirmedSnapshot, confirmedPlan.sourceSessionId ? 'chat' : 'workbench');
      const run = {
        ...baseRun,
        executionContext: captureExecutionContext(),
        sourceSessionId: confirmedPlan.sourceSessionId,
      };
      await saveRun(ctx, run);
      await saveReviewPolicy(ctx, {
        runId: run.id,
        defaultRequiresReview: true,
        allowHumanOverride: true,
        stagePolicies: confirmedSnapshot.stages.map((stage) => ({
          stageId: stage.id,
          stageName: stage.name,
          requiresReview: confirmedSnapshot.reviewCheckpoints.length === 0
            ? true
            : confirmedSnapshot.reviewCheckpoints.some((item) => item.includes(stage.name)),
          humanCheckpointRequired: confirmedSnapshot.humanCheckpoints.some((item) => item.includes(stage.name)),
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await savePlanDraft(ctx, {
        ...confirmedPlan,
        runId: run.id,
        updatedAt: Date.now(),
      });
      await appendRunEvent(ctx, createRunCreatedEvent(run));
      const startedRun = await startOrchestratorRun(ctx, run);
      ctx.events.emit(ORCHESTRATOR_EVENTS.planDraftsChanged, { planDraftId: confirmedPlan.id });
      ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
      ctx.ui.workbench.open({
        id: `orchestrator.run:${run.id}`,
        viewId: ORCHESTRATOR_VIEWS.run,
        title: startedRun.goal,
        description: startedRun.planTitle,
        payload: { run: startedRun },
        layoutMode: 'replace',
      });
      return startedRun;
    },
    {
      title: 'Confirm Orchestrator Plan Draft',
      description: 'Confirm a plan draft and hand it off to the orchestrator as a run.',
    },
  );

  ctx.commands.register<OrchestratorCreateTemplateInput, unknown>(
    ORCHESTRATOR_COMMANDS.createTemplate,
    async ({ name }) => {
      const template = createDefaultTemplate(name || 'Untitled Template');
      await saveTemplate(ctx, template);
      ctx.events.emit(ORCHESTRATOR_EVENTS.templatesChanged, { templateId: template.id });
      ctx.ui.workbench.open({
        id: `orchestrator.template:${template.id}`,
        viewId: ORCHESTRATOR_VIEWS.template,
        title: template.name,
        description: 'New template',
        payload: { template },
        layoutMode: 'replace',
      });
      return template;
    },
    {
      title: 'Create Orchestrator Template',
      description: 'Create and open a new orchestrator template.',
    },
  );

  ctx.commands.register<OrchestratorCreateTemplateInput, unknown>(
    ORCHESTRATOR_COMMANDS.createSampleNovelTemplate,
    async ({ name }) => {
      const template = createSampleNovelTemplate(name || 'Novel Writing Basic');
      await saveTemplate(ctx, template);
      ctx.events.emit(ORCHESTRATOR_EVENTS.templatesChanged, { templateId: template.id });
      return template;
    },
  );

  ctx.commands.register<OrchestratorCreateTemplateInput, unknown>(
    ORCHESTRATOR_COMMANDS.createSampleSoftwareTemplate,
    async ({ name }) => {
      const template = createSampleSoftwareTemplate(name || 'Software Delivery Basic');
      await saveTemplate(ctx, template);
      ctx.events.emit(ORCHESTRATOR_EVENTS.templatesChanged, { templateId: template.id });
      return template;
    },
  );

  ctx.commands.register<OrchestratorUpdateTemplateInput, unknown>(
    ORCHESTRATOR_COMMANDS.updateTemplate,
    async ({ templateId, patch }) => {
      const current = await getTemplate(ctx, templateId);
      if (!current) throw new Error(`Template not found: ${templateId}`);
      const template = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      await saveTemplate(ctx, template);
      ctx.events.emit(ORCHESTRATOR_EVENTS.templatesChanged, { templateId: template.id });
      return template;
    },
    {
      title: 'Update Orchestrator Template',
      description: 'Update orchestrator template metadata.',
    },
  );

  ctx.commands.register<OrchestratorDuplicateTemplateInput, unknown>(
    ORCHESTRATOR_COMMANDS.duplicateTemplate,
    async ({ templateId, name }) => {
      const template = await getTemplate(ctx, templateId);
      if (!template) throw new Error(`Template not found: ${templateId}`);
      const duplicated = cloneTemplate(template, name);
      await saveTemplate(ctx, duplicated);
      ctx.events.emit(ORCHESTRATOR_EVENTS.templatesChanged, { templateId: duplicated.id });
      ctx.ui.workbench.open({
        id: `orchestrator.template:${duplicated.id}`,
        viewId: ORCHESTRATOR_VIEWS.template,
        title: duplicated.name,
        description: 'Duplicated template',
        payload: { template: duplicated },
        layoutMode: 'replace',
      });
      return duplicated;
    },
    {
      title: 'Duplicate Orchestrator Template',
      description: 'Duplicate an orchestrator template.',
    },
  );

  ctx.commands.register<OrchestratorDeleteTemplateInput, boolean>(
    ORCHESTRATOR_COMMANDS.deleteTemplate,
    async ({ templateId }) => {
      const template = await getTemplate(ctx, templateId);
      if (!template) return false;
      await deleteTemplate(ctx, templateId);
      ctx.events.emit(ORCHESTRATOR_EVENTS.templatesChanged, { templateId });
      return true;
    },
    {
      title: 'Delete Orchestrator Template',
      description: 'Delete an orchestrator template.',
    },
  );

  ctx.commands.register<OrchestratorMatchTemplatesInput, unknown>(
    ORCHESTRATOR_COMMANDS.matchTemplates,
    async (input) => {
      const templates = await listTemplates(ctx);
      return matchTemplatesByGoal(templates, input);
    },
    {
      title: 'Match Orchestrator Templates',
      description: 'Return matching orchestrator templates for a goal.',
    },
  );

  ctx.commands.register<OrchestratorGetRunInput, unknown>(
    ORCHESTRATOR_COMMANDS.getRun,
    async ({ runId }) => getRun(ctx, runId),
    {
      title: 'Get Orchestrator Run',
      description: 'Return a stored orchestrator run.',
    },
  );

  ctx.commands.register<OrchestratorWakeRunInput, unknown>(
    ORCHESTRATOR_COMMANDS.wakeRun,
    async (input) => wakeRunById(ctx, input),
    {
      title: 'Wake Orchestrator Run',
      description: 'Wake the main orchestrator agent for a run.',
    },
  );

  ctx.commands.register<OrchestratorPauseRunInput, unknown>(
    ORCHESTRATOR_COMMANDS.pauseRun,
    async (input) => pauseOrchestratorRun(ctx, input),
    {
      title: 'Pause Orchestrator Run',
      description: 'Request pause for a running orchestrator run.',
    },
  );

  ctx.commands.register<OrchestratorResumeRunInput, unknown>(
    ORCHESTRATOR_COMMANDS.resumeRun,
    async (input) => resumeOrchestratorRun(ctx, input),
    {
      title: 'Resume Orchestrator Run',
      description: 'Resume a paused orchestrator run.',
    },
  );

  ctx.commands.register<OrchestratorCancelRunInput, unknown>(
    ORCHESTRATOR_COMMANDS.cancelRun,
    async (input) => cancelOrchestratorRun(ctx, input),
    {
      title: 'Cancel Orchestrator Run',
      description: 'Cancel an orchestrator run.',
    },
  );

  ctx.commands.register<OrchestratorCompleteTaskInput, unknown>(
    ORCHESTRATOR_COMMANDS.completeTask,
    async (input) => completeOrchestratorTask(ctx, input),
    {
      title: 'Complete Orchestrator Task',
      description: 'Mark an orchestrator task as completed.',
    },
  );

  ctx.commands.register<OrchestratorOverrideReviewInput, unknown>(
    ORCHESTRATOR_COMMANDS.overrideReview,
    async (input) => overrideReviewDecision(ctx, input),
    {
      title: 'Override Orchestrator Review',
      description: 'Record a human review decision and apply it to the run.',
    },
  );

  ctx.commands.register<OrchestratorUpdateTaskInput, unknown>(
    ORCHESTRATOR_COMMANDS.updateTask,
    async (input) => updateOrchestratorTask(ctx, input),
    {
      title: 'Update Orchestrator Task',
      description: 'Update a task summary or human guidance before continuing.',
    },
  );

  ctx.commands.register<OrchestratorRetryTaskInput, unknown>(
    ORCHESTRATOR_COMMANDS.retryTask,
    async (input) => retryOrchestratorTask(ctx, input),
    {
      title: 'Retry Orchestrator Task',
      description: 'Retry a failed or paused orchestrator task.',
    },
  );

  ctx.commands.register<OrchestratorSkipTaskInput, unknown>(
    ORCHESTRATOR_COMMANDS.skipTask,
    async (input) => skipOrchestratorTask(ctx, input),
    {
      title: 'Skip Orchestrator Task',
      description: 'Skip a task and allow the flow to continue.',
    },
  );

  ctx.commands.register(ORCHESTRATOR_COMMANDS.listTemplates, async () => listTemplates(ctx), {
    title: 'List Orchestrator Templates',
    description: 'List stored orchestrator templates.',
  });

  ctx.commands.register(ORCHESTRATOR_COMMANDS.listRuns, async () => listRuns(ctx), {
    title: 'List Orchestrator Runs',
    description: 'List stored orchestrator runs.',
  });

  ctx.commands.register(ORCHESTRATOR_COMMANDS.listTasks, async () => listTasks(ctx), {
    title: 'List Orchestrator Tasks',
    description: 'List stored orchestrator tasks.',
  });
}

function captureExecutionContext() {
  const sessionState = useSessionStore.getState();
  const workspaceState = useWorkspaceStore.getState();
  const workspacePath = (
    workspaceState.workspaces.find((workspace) => workspace.id === workspaceState.activeWorkspaceId)?.path
    || workspaceState.workspaces[0]?.path
    || ''
  );
  return {
    providerId: sessionState.composerControls.providerId,
    model: sessionState.composerControls.modelName,
    reasoning: sessionState.composerControls.reasoning,
    workspacePath,
    toolPolicy: {
      permissionMode: sessionState.composerControls.fullAuto ? 'full_auto' as const : 'manual' as const,
    },
    capturedAt: Date.now(),
  } satisfies OrchestratorExecutionContext;
}
