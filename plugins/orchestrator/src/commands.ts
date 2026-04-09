import type { PluginContext } from '../../../src/plugin/sdk';
import { ORCHESTRATOR_COMMANDS, ORCHESTRATOR_EVENTS, ORCHESTRATOR_VIEWS } from './constants';
import { appendRunEvent, deleteTemplate, getRun, getTemplate, listRuns, listTasks, listTemplates, saveRun, saveTemplate } from './storage';
import { startOrchestratorRun, wakeRunById } from './runtime';
import type {
  OrchestratorCancelRunInput,
  OrchestratorCompleteTaskInput,
  OrchestratorCreateRunInput,
  OrchestratorCreateTemplateInput,
  OrchestratorDeleteTemplateInput,
  OrchestratorDuplicateTemplateInput,
  OrchestratorGetRunInput,
  OrchestratorMatchTemplatesInput,
  OrchestratorPauseRunInput,
  OrchestratorResumeRunInput,
  OrchestratorUpdateTemplateInput,
  OrchestratorWakeRunInput,
} from './types';
import {
  cloneTemplate,
  createDefaultTemplate,
  createRunCreatedEvent,
  createRunFromTemplate,
  createSampleNovelTemplate,
  createSampleSoftwareTemplate,
  matchTemplatesByGoal,
} from './utils';
import { completeOrchestratorTask, pauseOrchestratorRun, resumeOrchestratorRun } from './runtime';
import { cancelOrchestratorRun } from './runtime';
import { updateTemplate } from './storage';

export function registerOrchestratorCommands(ctx: PluginContext) {
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
      const template = await updateTemplate(ctx, templateId, (current) => ({
        ...current,
        ...patch,
        updatedAt: Date.now(),
      }));
      if (!template) throw new Error(`Template not found: ${templateId}`);
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

  ctx.commands.register<OrchestratorCreateRunInput, unknown>(
    ORCHESTRATOR_COMMANDS.createRun,
    async ({ templateId, goal, source = 'workbench' }) => {
      const template = await getTemplate(ctx, templateId);
      if (!template) throw new Error(`Template not found: ${templateId}`);
      const run = createRunFromTemplate(template, goal, source);
      await saveRun(ctx, run);
      await appendRunEvent(ctx, createRunCreatedEvent(run));
      const startedRun = await startOrchestratorRun(ctx, template, run);
      ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
      ctx.ui.workbench.open({
        id: `orchestrator.run:${run.id}`,
        viewId: ORCHESTRATOR_VIEWS.run,
        title: startedRun.goal,
        description: startedRun.templateName,
        payload: { run: startedRun },
        layoutMode: 'replace',
      });
      return startedRun;
    },
    {
      title: 'Create Orchestrator Run',
      description: 'Create a new orchestrator run from a template.',
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
