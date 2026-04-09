import type { PluginContext } from '../../../src/plugin/sdk';
import { WORKFLOW_COMMANDS, WORKFLOW_EVENTS, WORKFLOW_VIEWS } from './constants';
import { registerWorkflowNodeType } from './nodeRegistry';
import { getRun, getWorkflow, listRuns, saveWorkflow } from './storage';
import { cancelWorkflowRun, pauseWorkflowRun, resumeWorkflowRun, retryWorkflowRun, runWorkflow } from './runtime';
import type {
  WorkflowCancelInput,
  WorkflowCreateInput,
  WorkflowNodeTypeDefinition,
  WorkflowPauseInput,
  WorkflowRetryInput,
  WorkflowResumeInput,
  WorkflowRunInput,
  WorkflowStatusInput,
} from './types';
import { createDefaultWorkflow, createLlmIfTemplateWorkflow, createLoopTemplateWorkflow } from './utils';

export function registerWorkflowCommands(ctx: PluginContext) {
  ctx.commands.register<WorkflowCreateInput, unknown>(
    WORKFLOW_COMMANDS.create,
    async ({ name }) => {
      const workflow = createDefaultWorkflow(name || 'Untitled Workflow');
      await saveWorkflow(ctx, workflow);
      ctx.events.emit(WORKFLOW_EVENTS.changed, { workflowId: workflow.id });
      ctx.ui.workbench.open({
        id: `workflow.editor:${workflow.id}`,
        viewId: WORKFLOW_VIEWS.editor,
        title: workflow.name,
        description: 'New workflow',
        payload: { workflow },
        layoutMode: 'replace',
      });
      return workflow;
    },
    {
      title: 'Create Workflow',
      description: 'Create and open a workflow definition.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    },
  );

  ctx.commands.register<WorkflowCreateInput, unknown>(
    'workflow.createSample.llmIf',
    async ({ name }) => {
      const workflow = createLlmIfTemplateWorkflow(name || 'LLM Decide');
      await saveWorkflow(ctx, workflow);
      ctx.events.emit(WORKFLOW_EVENTS.changed, { workflowId: workflow.id });
      return workflow;
    },
  );

  ctx.commands.register<WorkflowCreateInput, unknown>(
    'workflow.createSample.loop',
    async ({ name }) => {
      const workflow = createLoopTemplateWorkflow(name || 'Loop Summaries');
      await saveWorkflow(ctx, workflow);
      ctx.events.emit(WORKFLOW_EVENTS.changed, { workflowId: workflow.id });
      return workflow;
    },
  );

  ctx.commands.register<WorkflowRunInput, unknown>(
    WORKFLOW_COMMANDS.run,
    async ({ workflowId }) => {
      const workflow = await getWorkflow(ctx, workflowId);
      if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
      return runWorkflow(ctx, workflow);
    },
    {
      title: 'Run Workflow',
      description: 'Run a workflow definition.',
      inputSchema: {
        type: 'object',
        properties: { workflowId: { type: 'string' } },
        required: ['workflowId'],
      },
    },
  );

  ctx.commands.register<WorkflowPauseInput, boolean>(
    WORKFLOW_COMMANDS.pause,
    async ({ runId }) => pauseWorkflowRun(runId),
    {
      title: 'Pause Workflow',
      description: 'Pause a running workflow at the next checkpoint.',
      inputSchema: {
        type: 'object',
        properties: { runId: { type: 'string' } },
        required: ['runId'],
      },
    },
  );

  ctx.commands.register<WorkflowResumeInput, unknown>(
    WORKFLOW_COMMANDS.resume,
    async ({ runId }) => {
      const run = await getRun(ctx, runId);
      if (!run) throw new Error(`Workflow run not found: ${runId}`);
      if (run.status !== 'paused') throw new Error(`Workflow run is not paused: ${runId}`);
      const workflow = await getWorkflow(ctx, run.workflowId);
      if (!workflow) throw new Error(`Workflow not found: ${run.workflowId}`);
      return resumeWorkflowRun(ctx, workflow, run);
    },
    {
      title: 'Resume Workflow',
      description: 'Resume a paused workflow run.',
      inputSchema: {
        type: 'object',
        properties: { runId: { type: 'string' } },
        required: ['runId'],
      },
    },
  );

  ctx.commands.register<WorkflowRetryInput, unknown>(
    WORKFLOW_COMMANDS.retry,
    async ({ runId }) => {
      const run = await getRun(ctx, runId);
      if (!run) throw new Error(`Workflow run not found: ${runId}`);
      const workflow = await getWorkflow(ctx, run.workflowId);
      if (!workflow) throw new Error(`Workflow not found: ${run.workflowId}`);
      return retryWorkflowRun(ctx, workflow, run);
    },
    {
      title: 'Retry Workflow Node',
      description: 'Retry the current failed workflow node.',
      inputSchema: {
        type: 'object',
        properties: { runId: { type: 'string' } },
        required: ['runId'],
      },
    },
  );

  ctx.commands.register<WorkflowCancelInput, boolean>(
    WORKFLOW_COMMANDS.cancel,
    async ({ runId }) => cancelWorkflowRun(runId),
    {
      title: 'Cancel Workflow',
      description: 'Cancel a running workflow run.',
      inputSchema: {
        type: 'object',
        properties: { runId: { type: 'string' } },
        required: ['runId'],
      },
    },
  );

  ctx.commands.register<WorkflowStatusInput, unknown>(
    WORKFLOW_COMMANDS.getStatus,
    async ({ runId }) => getRun(ctx, runId),
    {
      title: 'Get Workflow Status',
      description: 'Get stored workflow run status.',
      inputSchema: {
        type: 'object',
        properties: { runId: { type: 'string' } },
        required: ['runId'],
      },
    },
  );

  ctx.commands.register('workflow.listRuns', async () => listRuns(ctx));

  ctx.commands.register<WorkflowNodeTypeDefinition, WorkflowNodeTypeDefinition>(
    WORKFLOW_COMMANDS.registerNodeType,
    async (definition) => {
      const registered = registerWorkflowNodeType(definition);
      ctx.events.emit(WORKFLOW_EVENTS.nodeTypesChanged, { id: registered.id });
      return registered;
    },
    {
      title: 'Register Workflow Node Type',
      description: 'Register a Workflow plugin node type.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['id', 'title'],
      },
    },
  );

  ctx.events.on(WORKFLOW_EVENTS.nodeTypeRegister, (payload) => {
    const definition = payload as WorkflowNodeTypeDefinition;
    const registered = registerWorkflowNodeType(definition);
    ctx.events.emit(WORKFLOW_EVENTS.nodeTypesChanged, { id: registered.id });
  });

  queueMicrotask(() => ctx.events.emit(WORKFLOW_EVENTS.ready, { plugin: 'workflow' }));
}
