import type { PluginContext } from '../../../src/plugin/sdk';
import { WORKFLOW_COMMANDS, WORKFLOW_EVENTS, WORKFLOW_VIEWS } from './constants';
import { registerWorkflowNodeType } from './nodeRegistry';
import { getRun, getWorkflow, listRuns, saveWorkflow } from './storage';
import { cancelWorkflowRun, runWorkflow } from './runtime';
import type { WorkflowCancelInput, WorkflowCreateInput, WorkflowRunInput, WorkflowStatusInput } from './types';
import type { WorkflowNodeTypeDefinition } from './types';
import { createDefaultWorkflow } from './utils';

export function registerWorkflowCommands(ctx: PluginContext) {
  ctx.commands.register<WorkflowCreateInput, unknown>(
    WORKFLOW_COMMANDS.create,
    async ({ name }) => {
      const workflow = createDefaultWorkflow(name || 'Untitled Workflow');
      await saveWorkflow(ctx, workflow);
      ctx.events.emit(WORKFLOW_EVENTS.changed, { workflowId: workflow.id });
      ctx.ui.workbench.open({
        viewId: WORKFLOW_VIEWS.editor,
        title: workflow.name,
        description: 'New workflow',
        payload: { workflow },
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
