import type { PluginContext, RunningCommand } from '../../../src/plugin/sdk';
import { WORKFLOW_EVENTS, WORKFLOW_VIEWS } from './constants';
import { getWorkflowSettings, saveRun } from './storage';
import type { WorkflowDefinition, WorkflowRun, WorkflowRuntimeHandle } from './types';
import { getWorkflowNodeExecutor } from './nodeRegistry';
import { createRun, getExecutionOrder } from './utils';

const activeRuns = new Map<string, WorkflowRuntimeHandle>();

export async function runWorkflow(ctx: PluginContext, workflow: WorkflowDefinition) {
  const settings = await getWorkflowSettings(ctx);
  let run = createRun(workflow);
  run.status = 'running';
  await persistAndEmit(ctx, workflow, run, settings.openRunViewOnStart);

  let cancelled = false;
  activeRuns.set(run.id, {
    cancel: async () => {
      cancelled = true;
      const handle = activeRuns.get(run.id);
      if (handle?.runningCommand) {
        await handle.runningCommand.cancel();
      }
      run = { ...run, status: 'cancelled', endedAt: Date.now() };
      for (const nodeRun of Object.values(run.nodeRuns)) {
        if (nodeRun.status === 'running' || nodeRun.status === 'pending') {
          nodeRun.status = nodeRun.status === 'running' ? 'cancelled' : 'skipped';
          nodeRun.endedAt = Date.now();
        }
      }
      await persistAndEmit(ctx, workflow, run, settings.openRunViewOnStart);
      activeRuns.delete(run.id);
      return true;
    },
  });

  void executeWorkflow(ctx, workflow, run, () => cancelled, settings.openRunViewOnStart).finally(() => {
    activeRuns.delete(run.id);
  });

  if (settings.openRunViewOnStart) {
    ctx.ui.workbench.open({
      id: `workflow.run:${run.id}`,
      viewId: WORKFLOW_VIEWS.run,
      title: `Run: ${workflow.name}`,
      description: 'Workflow is running',
      payload: { workflow, run },
      lifecycle: 'live',
      layoutMode: 'replace',
    });
  }

  return run;
}

export async function cancelWorkflowRun(runId: string) {
  return activeRuns.get(runId)?.cancel() || false;
}

async function executeWorkflow(
  ctx: PluginContext,
  workflow: WorkflowDefinition,
  run: WorkflowRun,
  isCancelled: () => boolean,
  openRunView: boolean,
) {
  const settings = await getWorkflowSettings(ctx);
  const order = getExecutionOrder(workflow);
  let hasError = false;

  for (const node of order) {
    if (isCancelled() || run.status === 'cancelled') return;
    const nodeRun = run.nodeRuns[node.id];
    nodeRun.status = 'running';
    nodeRun.startedAt = Date.now();
    await persistAndEmit(ctx, workflow, run, openRunView);

    try {
      const executor = getWorkflowNodeExecutor(node.type);
      if (!executor) throw new Error(`Workflow node executor not registered: ${node.type}`);
      nodeRun.output = await executor.run({
        ctx,
        workflow,
        run,
        node,
        nodeRun,
        signal: {
          isCancelled,
          setRunningCommand: (runningCommand) => setRunningCommand(run.id, runningCommand),
        },
        update: () => persistAndEmit(ctx, workflow, run, openRunView),
      });

      const currentStatus: string = nodeRun.status;
      if (currentStatus !== 'cancelled') {
        nodeRun.status = 'success';
      }
      nodeRun.endedAt = Date.now();
      await persistAndEmit(ctx, workflow, run, openRunView);
    } catch (error) {
      hasError = true;
      nodeRun.status = 'error';
      nodeRun.error = error instanceof Error ? error.message : String(error || 'Workflow failed');
      nodeRun.endedAt = Date.now();
      await persistAndEmit(ctx, workflow, run, openRunView);
      if (!settings.continueOnError) {
        for (const pending of Object.values(run.nodeRuns).filter((item) => item.status === 'pending')) {
          pending.status = 'skipped';
          pending.endedAt = Date.now();
        }
        run.status = 'error';
        run.endedAt = Date.now();
        await persistAndEmit(ctx, workflow, run, openRunView);
        return;
      }
    }
  }

  if (run.status !== 'cancelled') {
    run.status = hasError ? 'error' : 'success';
    run.endedAt = Date.now();
    await persistAndEmit(ctx, workflow, run, openRunView);
  }
}

function setRunningCommand(runId: string, runningCommand?: RunningCommand<unknown>) {
  const handle = activeRuns.get(runId);
  if (handle) {
    handle.runningCommand = runningCommand;
  }
}

async function persistAndEmit(ctx: PluginContext, workflow: WorkflowDefinition, run: WorkflowRun, openRunView = true) {
  await saveRun(ctx, run);
  ctx.events.emit(WORKFLOW_EVENTS.runUpdated, { workflow, run });
  if (!openRunView) return;
  ctx.ui.workbench.open({
    id: `workflow.run:${run.id}`,
    viewId: WORKFLOW_VIEWS.run,
    title: `Run: ${workflow.name}`,
    description: `Status: ${run.status}`,
    payload: { workflow, run },
    lifecycle: run.status === 'running' ? 'live' : 'snapshot',
    layoutMode: 'replace',
  });
}
