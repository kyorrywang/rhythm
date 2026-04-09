import type { PluginContext, RunningCommand } from '../../../src/plugin/sdk';
import { WORKFLOW_EVENTS, WORKFLOW_VIEWS } from './constants';
import { getWorkflowSettings, saveRun } from './storage';
import type { WorkflowDefinition, WorkflowNode, WorkflowRun, WorkflowRuntimeHandle } from './types';
import { getWorkflowNodeExecutor } from './nodeRegistry';
import { createRun, getExecutionOrder, getOutgoingEdges } from './utils';

const activeRuns = new Map<string, WorkflowRuntimeHandle>();

export async function runWorkflow(ctx: PluginContext, workflow: WorkflowDefinition) {
  const settings = await getWorkflowSettings(ctx);
  const run = createRun(workflow);
  run.status = 'running';
  await persistAndEmit(ctx, workflow, run, settings.openRunViewOnStart);

  startActiveRun(ctx, workflow, run, settings.openRunViewOnStart);

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

export async function resumeWorkflowRun(ctx: PluginContext, workflow: WorkflowDefinition, run: WorkflowRun) {
  const settings = await getWorkflowSettings(ctx);
  const resumedRun: WorkflowRun = {
    ...run,
    status: 'running',
    endedAt: undefined,
  };
  await persistAndEmit(ctx, workflow, resumedRun, settings.openRunViewOnStart);
  startActiveRun(ctx, workflow, resumedRun, settings.openRunViewOnStart);
  return resumedRun;
}

export async function retryWorkflowRun(ctx: PluginContext, workflow: WorkflowDefinition, run: WorkflowRun) {
  const settings = await getWorkflowSettings(ctx);
  const failedNodeRun = Object.values(run.nodeRuns).find((nodeRun) => nodeRun.status === 'error');
  if (!failedNodeRun) {
    throw new Error(`Workflow run has no failed node to retry: ${run.id}`);
  }

  const retriedRun: WorkflowRun = {
    ...run,
    status: 'running',
    endedAt: undefined,
    currentNodeId: failedNodeRun.nodeId,
    resumeFromNodeId: failedNodeRun.nodeId,
    nodeRuns: {
      ...run.nodeRuns,
      [failedNodeRun.nodeId]: {
        ...failedNodeRun,
        status: 'pending',
        startedAt: undefined,
        endedAt: undefined,
        error: undefined,
        logs: [],
        checkpoint: undefined,
      },
    },
  };
  await persistAndEmit(ctx, workflow, retriedRun, settings.openRunViewOnStart);
  startActiveRun(ctx, workflow, retriedRun, settings.openRunViewOnStart);
  return retriedRun;
}

export async function pauseWorkflowRun(runId: string) {
  const handle = activeRuns.get(runId);
  if (!handle) return false;
  handle.pauseRequested = true;
  return true;
}

export async function cancelWorkflowRun(runId: string) {
  return activeRuns.get(runId)?.cancel() || false;
}

function startActiveRun(
  ctx: PluginContext,
  workflow: WorkflowDefinition,
  run: WorkflowRun,
  openRunView: boolean,
) {
  const handle: WorkflowRuntimeHandle = {
    workflow,
    run,
    pauseRequested: false,
    cancelRequested: false,
    cancel: async () => {
      handle.cancelRequested = true;
      if (handle.runningCommand) {
        await handle.runningCommand.cancel();
      }
      return true;
    },
    requestPause: async () => {
      handle.pauseRequested = true;
      return true;
    },
  };
  activeRuns.set(run.id, handle);

  void executeWorkflow(ctx, workflow, run, handle, openRunView).finally(() => {
    const active = activeRuns.get(run.id);
    if (active === handle) {
      activeRuns.delete(run.id);
    }
  });
}

async function executeWorkflow(
  ctx: PluginContext,
  workflow: WorkflowDefinition,
  run: WorkflowRun,
  handle: WorkflowRuntimeHandle,
  openRunView: boolean,
) {
  const settings = await getWorkflowSettings(ctx);
  const order = getExecutionOrder(workflow);
  let hasError = false;
  let currentNodeId: string | undefined = run.resumeFromNodeId || order[0]?.id;
  let safetyCounter = 0;

  while (currentNodeId) {
    if (safetyCounter > Math.max(500, workflow.nodes.length * 50)) {
      throw new Error('Workflow execution exceeded safety limit.');
    }
    safetyCounter += 1;

    const index = order.findIndex((item) => item.id === currentNodeId);
    const node = workflow.nodes.find((item) => item.id === currentNodeId);
    if (!node) {
      throw new Error(`Workflow node not found: ${currentNodeId}`);
    }
    const nodeRun = run.nodeRuns[node.id];
    if (!nodeRun) continue;

    if (handle.cancelRequested) {
      markRemainingPendingNodes(run, order, index, 'cancelled');
      run.status = 'cancelled';
      run.endedAt = Date.now();
      run.currentNodeId = undefined;
      await persistAndEmit(ctx, workflow, run, openRunView);
      return;
    }

    run.currentNodeId = node.id;
    run.resumeFromNodeId = node.id;
    nodeRun.status = 'running';
    nodeRun.startedAt = Date.now();
    nodeRun.attempt = (nodeRun.attempt || 0) + 1;
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
          isCancelled: () => handle.cancelRequested,
          setRunningCommand: (runningCommand) => setRunningCommand(run.id, runningCommand),
        },
        update: () => persistAndEmit(ctx, workflow, run, openRunView),
      });

      const finalNodeStatus: string = nodeRun.status;
      if (finalNodeStatus !== 'cancelled') {
        nodeRun.status = 'success';
      }
      nodeRun.endedAt = Date.now();
      run.variables.previous = nodeRun.output;
      nodeRun.checkpoint = {
        savedAt: Date.now(),
        kind: 'node_boundary',
        data: {
          completedNodeId: node.id,
          nextNodeId: resolveNextNodeId(workflow, node, run, order),
        },
      };
      const nextNodeId = resolveNextNodeId(workflow, node, run, order);
      run.resumeFromNodeId = nextNodeId;
      await persistAndEmit(ctx, workflow, run, openRunView);

      if (handle.pauseRequested && nextNodeId) {
        run.status = 'paused';
        run.endedAt = Date.now();
        run.currentNodeId = undefined;
        await persistAndEmit(ctx, workflow, run, openRunView);
        return;
      }
      currentNodeId = nextNodeId;
    } catch (error) {
      if (handle.cancelRequested) {
        nodeRun.status = 'cancelled';
        nodeRun.endedAt = Date.now();
        markRemainingPendingNodes(run, order, index + 1, 'cancelled');
        run.status = 'cancelled';
        run.endedAt = Date.now();
        run.currentNodeId = undefined;
        await persistAndEmit(ctx, workflow, run, openRunView);
        return;
      }

      hasError = true;
      nodeRun.status = 'error';
      nodeRun.error = error instanceof Error ? error.message : String(error || 'Workflow failed');
      nodeRun.endedAt = Date.now();
      await persistAndEmit(ctx, workflow, run, openRunView);
      if (!settings.continueOnError) {
        markRemainingPendingNodes(run, order, index + 1, 'skipped');
        run.status = 'error';
        run.endedAt = Date.now();
        run.currentNodeId = undefined;
        await persistAndEmit(ctx, workflow, run, openRunView);
        return;
      }
      currentNodeId = undefined;
    }
  }

  markAllPendingNodes(run, 'skipped');
  run.status = hasError ? 'error' : 'success';
  run.endedAt = Date.now();
  run.currentNodeId = undefined;
  run.resumeFromNodeId = undefined;
  await persistAndEmit(ctx, workflow, run, openRunView);
}

function markRemainingPendingNodes(
  run: WorkflowRun,
  order: WorkflowNode[],
  startIndex: number,
  status: 'cancelled' | 'skipped',
) {
  for (let index = startIndex; index < order.length; index += 1) {
    const nodeRun = run.nodeRuns[order[index].id];
    if (!nodeRun || nodeRun.status !== 'pending') continue;
    nodeRun.status = status;
    nodeRun.endedAt = Date.now();
  }
}

function markAllPendingNodes(run: WorkflowRun, status: 'cancelled' | 'skipped') {
  for (const nodeRun of Object.values(run.nodeRuns)) {
    if (nodeRun.status !== 'pending') continue;
    nodeRun.status = status;
    nodeRun.endedAt = Date.now();
  }
}

function resolveNextNodeId(workflow: WorkflowDefinition, node: WorkflowNode, run: WorkflowRun, order: WorkflowNode[]) {
  const outgoing = getOutgoingEdges(workflow, node.id);
  if (outgoing.length === 0) {
    const index = order.findIndex((item) => item.id === node.id);
    return order[index + 1]?.id;
  }

  if (node.type === 'if') {
    const result = run.nodeRuns[node.id]?.output as { branch?: string } | undefined;
    const branch = result?.branch || 'false';
    return (
      outgoing.find((edge) => edge.branch === branch)?.to ||
      outgoing.find((edge) => edge.branch === 'default')?.to ||
      outgoing.find((edge) => !edge.branch)?.to
    );
  }

  if (node.type === 'loop') {
    const result = run.nodeRuns[node.id]?.output as { branch?: string } | undefined;
    const branch = result?.branch || 'done';
    return (
      outgoing.find((edge) => edge.branch === branch)?.to ||
      outgoing.find((edge) => edge.branch === 'default')?.to ||
      outgoing.find((edge) => !edge.branch)?.to
    );
  }

  if (outgoing.length === 1) {
    return outgoing[0].to;
  }

  return outgoing.find((edge) => edge.branch === 'default')?.to || outgoing[0]?.to;
}

function setRunningCommand(runId: string, runningCommand?: RunningCommand<unknown>) {
  const handle = activeRuns.get(runId);
  if (handle) {
    handle.runningCommand = runningCommand;
  }
}

async function persistAndEmit(ctx: PluginContext, workflow: WorkflowDefinition, run: WorkflowRun, openRunView = true) {
  await saveRun(ctx, run);
  const active = activeRuns.get(run.id);
  if (active) {
    active.run = run;
  }
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
