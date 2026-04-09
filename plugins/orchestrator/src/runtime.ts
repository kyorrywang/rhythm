import type { PluginContext } from '../../../src/plugin/sdk';
import { ORCHESTRATOR_EVENTS } from './constants';
import { appendControlIntent, appendRunEvent, getRun, getTask, getTemplate, listTasksForRun, saveRun, saveTask, updateTask } from './storage';
import type {
  OrchestratorCancelRunInput,
  OrchestratorCompleteTaskInput,
  OrchestratorAgentTask,
  OrchestratorAgent,
  OrchestratorAgentRow,
  OrchestratorPauseRunInput,
  OrchestratorResumeRunInput,
  OrchestratorRun,
  OrchestratorStage,
  OrchestratorStageRow,
  OrchestratorTemplate,
  OrchestratorWakeRunInput,
} from './types';
import { createId } from './utils';

export async function startOrchestratorRun(
  ctx: PluginContext,
  template: OrchestratorTemplate,
  run: OrchestratorRun,
) {
  const startedAt = Date.now();
  const nextRun: OrchestratorRun = {
    ...run,
    status: 'running',
    lastWakeAt: startedAt,
    updatedAt: startedAt,
  };

  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: nextRun.id,
    type: 'run.started',
    title: 'Run started',
    detail: `Main agent entered ${nextRun.currentStageName || 'the first stage'}.`,
    createdAt: startedAt,
  });

  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  return wakeOrchestratorRun(ctx, template, nextRun, { runId: nextRun.id, reason: 'start' });
}

export async function wakeOrchestratorRun(
  ctx: PluginContext,
  template: OrchestratorTemplate,
  run: OrchestratorRun,
  input: OrchestratorWakeRunInput,
) {
  const wakeAt = Date.now();
  if (run.status === 'pause_requested' || run.status === 'paused' || run.status === 'cancelled') {
    return run;
  }
  const tasks = await listTasksForRun(ctx, run.id);
  const plan = buildDispatchPlan(template, tasks);
  const wokeRun: OrchestratorRun = {
    ...run,
    status: run.status === 'pending' ? 'running' : run.status,
    lastWakeAt: wakeAt,
    updatedAt: wakeAt,
  };

  await saveRun(ctx, wokeRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'agent.wake',
    title: 'Main agent woke up',
    detail: `Reason: ${input.reason || 'system'}`,
    createdAt: wakeAt,
  });

  let finalRun = wokeRun;

  if (plan.dispatches.length > 0) {
    const summary = plan.dispatches.length === 1
      ? `Dispatch ${plan.dispatches[0].agent.name} in ${plan.dispatches[0].stage.name}`
      : `Dispatch ${plan.dispatches.length} agents across ${plan.stageNames.join(', ')}`;
    finalRun = {
      ...wokeRun,
      status: 'running',
      currentStageId: plan.dispatches[0].stage.id,
      currentStageName: plan.dispatches[0].stage.name,
      currentAgentId: plan.dispatches[0].agent.id,
      currentAgentName: plan.dispatches[0].agent.name,
      activeTaskCount: tasks.filter((task) => isActiveTask(task)).length + plan.dispatches.length,
      lastDecisionAt: wakeAt,
      lastDecisionSummary: summary,
      updatedAt: wakeAt,
    };

    for (const dispatch of plan.dispatches) {
      const task: OrchestratorAgentTask = {
        id: createId('task'),
        runId: run.id,
        stageId: dispatch.stage.id,
        stageName: dispatch.stage.name,
        agentId: dispatch.agent.id,
        agentName: dispatch.agent.name,
        title: `${dispatch.agent.name} task`,
        status: 'pending',
        summary: dispatch.agent.goal,
        createdAt: wakeAt,
        updatedAt: wakeAt,
      };
      await saveTask(ctx, task);
      await appendRunEvent(ctx, {
        id: createId('evt'),
        runId: run.id,
        type: 'task.created',
        title: 'Agent task created',
        detail: `${task.agentName} is ready to execute.`,
        createdAt: wakeAt,
      });
    }
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.decision',
      title: 'Main agent made a decision',
      detail: summary,
      createdAt: wakeAt,
    });
  } else if (plan.activeCount > 0) {
    finalRun = {
      ...wokeRun,
      status: 'running',
      activeTaskCount: plan.activeCount,
      currentStageId: plan.currentStageId,
      currentStageName: plan.currentStageName,
      currentAgentId: undefined,
      currentAgentName: undefined,
      lastDecisionAt: wakeAt,
      lastDecisionSummary: `Waiting for ${plan.activeCount} active task(s) to finish.`,
      updatedAt: wakeAt,
    };
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.decision',
      title: 'Main agent is waiting',
      detail: `Waiting for ${plan.activeCount} active task(s) in ${plan.currentStageName || 'the current stage'}.`,
      createdAt: wakeAt,
    });
  } else {
    finalRun = {
      ...wokeRun,
      status: 'completed',
      activeTaskCount: 0,
      lastDecisionAt: wakeAt,
      lastDecisionSummary: 'No executable stage found. Run completed.',
      updatedAt: wakeAt,
    };
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.decision',
      title: 'Main agent finished the run',
      detail: 'No executable stage found.',
      createdAt: wakeAt,
    });
  }

  await saveRun(ctx, finalRun);
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: finalRun.id });
  return finalRun;
}

export async function wakeRunById(ctx: PluginContext, input: OrchestratorWakeRunInput) {
  const run = await getRun(ctx, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  const template = await getTemplate(ctx, run.templateId);
  if (!template) throw new Error(`Template not found: ${run.templateId}`);
  return wakeOrchestratorRun(ctx, template, run, input);
}

export async function pauseOrchestratorRun(ctx: PluginContext, input: OrchestratorPauseRunInput) {
  const run = await getRun(ctx, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status === 'paused' || run.status === 'completed' || run.status === 'cancelled') {
    return run;
  }

  const now = Date.now();
  const nextRun: OrchestratorRun = {
    ...run,
    status: run.activeTaskCount > 0 ? 'pause_requested' : 'paused',
    pauseRequestedAt: now,
    pausedAt: run.activeTaskCount > 0 ? run.pausedAt : now,
    updatedAt: now,
  };

  await saveRun(ctx, nextRun);
  await appendControlIntent(ctx, { runId: run.id, action: 'pause', createdAt: now });
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: run.activeTaskCount > 0 ? 'run.pause_requested' : 'run.paused',
    title: run.activeTaskCount > 0 ? 'Pause requested' : 'Run paused',
    detail: run.activeTaskCount > 0
      ? `Waiting for ${run.activeTaskCount} active task(s) to finish.`
      : 'No active tasks. Run paused immediately.',
    createdAt: now,
  });
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  return nextRun;
}

export async function resumeOrchestratorRun(ctx: PluginContext, input: OrchestratorResumeRunInput) {
  const run = await getRun(ctx, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status !== 'paused') {
    throw new Error(`Run is not paused: ${input.runId}`);
  }
  const template = await getTemplate(ctx, run.templateId);
  if (!template) throw new Error(`Template not found: ${run.templateId}`);

  const resumedAt = Date.now();
  const resumedRun: OrchestratorRun = {
    ...run,
    status: 'running',
    pausedAt: undefined,
    pauseRequestedAt: undefined,
    updatedAt: resumedAt,
  };

  await saveRun(ctx, resumedRun);
  await appendControlIntent(ctx, { runId: run.id, action: 'resume', createdAt: resumedAt });
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'run.resumed',
    title: 'Run resumed',
    detail: 'Main agent will be awakened again.',
    createdAt: resumedAt,
  });
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: resumedRun.id });
  return wakeOrchestratorRun(ctx, template, resumedRun, { runId: resumedRun.id, reason: 'resume' });
}

export async function completeOrchestratorTask(ctx: PluginContext, input: OrchestratorCompleteTaskInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  const now = Date.now();
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...current,
    status: 'completed',
    updatedAt: now,
  }));
  const run = await getRun(ctx, task.runId);
  if (!run || !nextTask) return { run, task: nextTask };

  let nextStatus = run.status;
  const nextActiveTaskCount = Math.max(0, run.activeTaskCount - 1);
  if (run.status === 'pause_requested' && nextActiveTaskCount === 0) {
    nextStatus = 'paused';
  }

  const nextRun: OrchestratorRun = {
    ...run,
    activeTaskCount: nextActiveTaskCount,
    status: nextStatus,
    pausedAt: nextStatus === 'paused' ? now : run.pausedAt,
    updatedAt: now,
  };

  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'task.updated',
    title: 'Task completed',
    detail: `${task.agentName || task.title} completed.`,
    createdAt: now,
  });

  if (run.status === 'pause_requested' && nextActiveTaskCount === 0) {
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'run.paused',
      title: 'Run paused',
      detail: 'All active tasks finished. Pause is now effective.',
      createdAt: now,
    });
  }

  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  if (nextRun.status === 'running' && nextRun.activeTaskCount === 0) {
    const template = await getTemplate(ctx, nextRun.templateId);
    if (template) {
      const awakened = await wakeOrchestratorRun(ctx, template, nextRun, { runId: nextRun.id, reason: 'task_completed' });
      return { run: awakened, task: nextTask };
    }
  }
  return { run: nextRun, task: nextTask };
}

export async function cancelOrchestratorRun(ctx: PluginContext, input: OrchestratorCancelRunInput) {
  const run = await getRun(ctx, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status === 'completed' || run.status === 'cancelled') return run;

  const now = Date.now();
  const nextRun: OrchestratorRun = {
    ...run,
    status: 'cancelled',
    activeTaskCount: 0,
    updatedAt: now,
  };

  await saveRun(ctx, nextRun);
  await appendControlIntent(ctx, { runId: run.id, action: 'cancel', createdAt: now });
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'run.updated',
    title: 'Run cancelled',
    detail: 'Further orchestration has been stopped.',
    createdAt: now,
  });
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  return nextRun;
}

function isActiveTask(task: OrchestratorAgentTask) {
  return task.status === 'pending' || task.status === 'running';
}

function buildDispatchPlan(template: OrchestratorTemplate, tasks: OrchestratorAgentTask[]) {
  for (const stageRow of template.stageRows) {
    const rowPlan = evaluateStageRow(stageRow, tasks);
    if (!rowPlan.completed) {
      return rowPlan;
    }
  }
  return {
    completed: true,
    dispatches: [],
    stageNames: [],
    activeCount: 0,
    currentStageId: undefined,
    currentStageName: undefined,
  };
}

function evaluateStageRow(stageRow: OrchestratorStageRow, tasks: OrchestratorAgentTask[]) {
  const dispatches: Array<{ stage: OrchestratorStage; agentRow: OrchestratorAgentRow; agent: OrchestratorAgent }> = [];
  let activeCount = 0;
  let currentStage: OrchestratorStage | null = null;

  for (const stage of stageRow.stages) {
    const stagePlan = evaluateStage(stage, tasks);
    if (!stagePlan.completed) {
      currentStage = currentStage || stage;
    }
    activeCount += stagePlan.activeCount;
    dispatches.push(...stagePlan.dispatches);
  }

  return {
    completed: stageRow.stages.every((stage) => evaluateStage(stage, tasks).completed),
    dispatches,
    stageNames: Array.from(new Set(dispatches.map((item) => item.stage.name))),
    activeCount,
    currentStageId: currentStage?.id,
    currentStageName: currentStage?.name,
  };
}

function evaluateStage(stage: OrchestratorStage, tasks: OrchestratorAgentTask[]) {
  for (const agentRow of stage.agentRows) {
    const rowTasks = agentRow.agents
      .map((agent) => ({ agent, task: findTask(tasks, stage.id, agent.id) }))
      .filter((item) => item.agent);
    const activeInRow = rowTasks.filter((item) => item.task && isActiveTask(item.task));
    const completedCount = rowTasks.filter((item) => item.task?.status === 'completed').length;
    if (activeInRow.length > 0) {
      return {
        completed: false,
        activeCount: activeInRow.length,
        dispatches: [] as Array<{ stage: OrchestratorStage; agentRow: OrchestratorAgentRow; agent: OrchestratorAgent }>,
      };
    }
    const toDispatch = rowTasks.filter((item) => !item.task).map((item) => item.agent);
    if (toDispatch.length > 0) {
      return {
        completed: false,
        activeCount: 0,
        dispatches: toDispatch.map((agent) => ({ stage, agentRow, agent })),
      };
    }
    if (completedCount === rowTasks.length) {
      continue;
    }
  }
  return {
    completed: true,
    activeCount: 0,
    dispatches: [] as Array<{ stage: OrchestratorStage; agentRow: OrchestratorAgentRow; agent: OrchestratorAgent }>,
  };
}

function findTask(tasks: OrchestratorAgentTask[], stageId: string, agentId: string) {
  return tasks.find((task) => task.stageId === stageId && task.agentId === agentId) || null;
}
