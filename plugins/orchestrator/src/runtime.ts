import type { PluginContext } from '../../../src/plugin/sdk';
import { useSessionStore } from '../../../src/shared/state/useSessionStore';
import { interruptAgentSession, isAgentSessionActive, launchAgentSession } from './agentSessionRuntime';
import { ORCHESTRATOR_EVENTS } from './constants';
import {
  appendControlIntent,
  appendRunEvent,
  getAgentRunByTaskId,
  getProjectState,
  getRun,
  getTask,
  listAgentRunsForRun,
  listArtifactsForRun,
  listReviewLogsForRun,
  saveReviewLog,
  listTasksForRun,
  saveAgentRun,
  saveArtifact,
  saveProjectState,
  saveRun,
  saveTask,
  updateAgentRun,
  updateArtifact,
  updateTask,
} from './storage';
import type {
  OrchestratorAgentRun,
  OrchestratorAgentTask,
  OrchestratorArtifact,
  OrchestratorCancelRunInput,
  OrchestratorCompleteTaskInput,
  OrchestratorConfirmedPlan,
  OrchestratorOverrideReviewInput,
  OrchestratorPauseRunInput,
  OrchestratorPlanStage,
  OrchestratorProjectState,
  OrchestratorResumeRunInput,
  OrchestratorRetryTaskInput,
  OrchestratorReviewLog,
  OrchestratorRun,
  OrchestratorSkipTaskInput,
  OrchestratorUpdateTaskInput,
  OrchestratorWakeRunInput,
  OrchestrationContext,
  OrchestrationDecisionRecord,
  OrchestrationDecision,
  OrchestrationInputSnapshot,
  ReviewAgentOutputSnapshot,
} from './types';
import { createId } from './utils';

const MAX_WATCHDOG_IDLE_MS = 5 * 60 * 1000;

type Dispatch = {
  parentTask: OrchestratorAgentTask;
  stage: OrchestratorPlanStage;
  kind: 'work' | 'review';
  agentId: string;
  agentName: string;
  goal: string;
};

export async function startOrchestratorRun(
  ctx: PluginContext,
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
  return wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'start' });
}

export async function wakeOrchestratorRun(
  ctx: PluginContext,
  run: OrchestratorRun,
  input: OrchestratorWakeRunInput,
) {
  const wakeAt = Date.now();
  if (run.status === 'pause_requested' || run.status === 'paused' || run.status === 'cancelled') {
    return run;
  }

  let tasks = await listTasksForRun(ctx, run.id);
  if (tasks.length === 0) {
    await seedPlanTasks(ctx, run, wakeAt);
    tasks = await listTasksForRun(ctx, run.id);
  }
  const reviewLogs = await listReviewLogsForRun(ctx, run.id);
  const projectState = await getProjectState(ctx, run.id);
  const activeTaskCount = tasks.filter((task) => isActiveTask(task)).length;
  const availableSlots = Math.max(0, (run.maxConcurrentTasks || 2) - activeTaskCount);
  const orchestrationContext: OrchestrationContext = {
    run,
    wakeReason: input.reason,
    tasks,
    reviewLogs,
    projectState,
    activeTaskCount,
    availableSlots,
  };
  const decision = makeOrchestrationDecision(orchestrationContext);
  const orchestrationInput = buildOrchestrationInput(orchestrationContext);
  const orchestrationPrompt = buildOrchestrationPrompt(orchestrationInput);
  const orchestrationDecision = buildOrchestrationDecisionRecord(decision, wakeAt);
  const wokeRun: OrchestratorRun = {
    ...run,
    status: run.status === 'pending' ? 'running' : run.status,
    watchdogStatus: 'healthy',
    watchdogWarning: undefined,
    watchdogCheckedAt: wakeAt,
    lastWakeAt: wakeAt,
    lastWakeReason: input.reason || 'system',
    orchestrationInput,
    orchestrationPrompt,
    orchestrationDecision,
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

  if (decision.status === 'dispatch') {
    const dispatches = resolveDispatches(tasks, decision);
    finalRun = {
      ...wokeRun,
      status: 'running',
      currentStageId: decision.currentStageId,
      currentStageName: decision.currentStageName,
      currentAgentId: decision.currentAgentId,
      currentAgentName: decision.currentAgentName,
      activeTaskCount: activeTaskCount + dispatches.length,
      lastDecisionAt: wakeAt,
      lastDecisionSummary: decision.summary,
      engineHealthSummary: `Dispatching ${dispatches.length} task(s) from ${decision.currentStageName || 'the current stage'}.`,
      orchestrationDecision,
      updatedAt: wakeAt,
    };

    for (const dispatch of dispatches) {
      const task: OrchestratorAgentTask = {
        id: createId('task'),
        runId: run.id,
        nodeType: dispatch.kind,
        kind: dispatch.kind,
        parentTaskId: dispatch.parentTask.id,
        rootTaskId: dispatch.parentTask.rootTaskId,
        depth: dispatch.parentTask.depth + 1,
        order: dispatch.parentTask.order + (dispatch.kind === 'work' ? 1 : 2),
        source: dispatch.kind === 'review' ? 'orchestrator_split' : dispatch.parentTask.source,
        latestAgentRunId: undefined,
        attemptCount: 0,
        stageId: dispatch.stage.id,
        stageName: dispatch.stage.name,
        agentId: dispatch.agentId,
        agentName: dispatch.agentName,
        title: `${dispatch.agentName} task`,
        status: 'ready',
        summary: dispatch.goal,
        failurePolicy: 'pause',
        createdAt: wakeAt,
        updatedAt: wakeAt,
      };
      const sessionId = `orchestrator-${run.id}-${dispatch.agentId}-${task.id}`;
      const agentInput = dispatch.kind === 'review'
        ? await buildReviewAgentInput(ctx, run, task, dispatch.stage)
        : buildWorkAgentInput(run, task, dispatch.stage, projectState, reviewLogs, await listArtifactsForRun(ctx, run.id));
      const agentPrompt = dispatch.kind === 'review'
        ? buildReviewAgentPrompt(agentInput)
        : buildWorkAgentPrompt(agentInput);
      const agentRun: OrchestratorAgentRun = {
        id: createId('agent_run'),
        runId: run.id,
        taskId: task.id,
        planId: run.planId,
        kind: dispatch.kind,
        stageId: dispatch.stage.id,
        stageName: dispatch.stage.name,
        agentId: dispatch.agentId,
        agentName: dispatch.agentName,
        sessionId,
        title: dispatch.agentName,
        prompt: agentPrompt,
        input: agentInput,
        status: 'pending',
        createdAt: wakeAt,
        updatedAt: wakeAt,
      };
      task.latestAgentRunId = agentRun.id;
      task.attemptCount = 1;
      task.sessionId = sessionId;
      await saveTask(ctx, task);
      await updateTask(ctx, dispatch.parentTask.id, (current) => ({
        ...current,
        status: dispatch.kind === 'review' ? 'waiting_review' : 'running',
        updatedAt: wakeAt,
      }));
      await saveAgentRun(ctx, agentRun);
      await appendRunEvent(ctx, {
        id: createId('evt'),
        runId: run.id,
        type: 'task.created',
        title: 'Agent task created',
        detail: `${task.agentName} is ready to execute.`,
        createdAt: wakeAt,
      });
      void startAgentRunSession(ctx, run, task, agentRun, {
        title: `${dispatch.agentName} · ${dispatch.stage.name}`,
        prompt: agentRun.prompt,
        startedDetail: `${dispatch.agentName} started executing in its own session.`,
      });
    }
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.decision',
      title: 'Main agent made a decision',
      detail: decision.summary,
      createdAt: wakeAt,
    });
  } else if (decision.status === 'wait') {
    finalRun = {
      ...wokeRun,
      status: 'running',
      activeTaskCount: orchestrationContext.activeTaskCount,
      currentStageId: decision.currentStageId,
      currentStageName: decision.currentStageName,
      currentAgentId: undefined,
      currentAgentName: undefined,
      lastDecisionAt: wakeAt,
      lastDecisionSummary: decision.summary,
      engineHealthSummary: decision.summary,
      orchestrationDecision,
      updatedAt: wakeAt,
    };
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.decision',
      title: 'Main agent is waiting',
      detail: decision.summary,
      createdAt: wakeAt,
    });
  } else if (decision.status === 'throttle') {
    finalRun = {
      ...wokeRun,
      status: 'running',
      activeTaskCount,
      lastDecisionAt: wakeAt,
      lastDecisionSummary: decision.summary,
      engineHealthSummary: decision.summary,
      orchestrationDecision,
      updatedAt: wakeAt,
    };
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.decision',
      title: 'Main agent is throttling dispatch',
      detail: decision.summary,
      createdAt: wakeAt,
    });
  } else {
    finalRun = {
      ...wokeRun,
      status: 'completed',
      activeTaskCount: 0,
      lastDecisionAt: wakeAt,
      lastDecisionSummary: decision.summary,
      engineHealthSummary: 'Run completed with no remaining executable stages.',
      orchestrationDecision,
      updatedAt: wakeAt,
    };
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'agent.decision',
      title: 'Main agent finished the run',
      detail: decision.summary,
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
  return wakeOrchestratorRun(ctx, run, input);
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
    engineHealthSummary: run.activeTaskCount > 0
      ? `Pause requested while ${run.activeTaskCount} task(s) finish safely.`
      : 'Run paused by a human operator.',
    lastHumanInterventionAt: now,
    lastHumanInterventionSummary: 'Paused the run.',
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
  if (run.activeTaskCount > 0) {
    const tasks = await listTasksForRun(ctx, run.id);
    await Promise.all(
      tasks
        .filter((task) => isActiveTask(task) && task.sessionId)
        .map((task) => interruptAgentSession(task.sessionId!)),
    );
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  return nextRun;
}

export async function resumeOrchestratorRun(ctx: PluginContext, input: OrchestratorResumeRunInput) {
  const run = await getRun(ctx, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.status !== 'paused') {
    throw new Error(`Run is not paused: ${input.runId}`);
  }

  const resumedAt = Date.now();
  const resumedRun: OrchestratorRun = {
    ...run,
    status: 'running',
    engineHealthSummary: 'Run resumed and waiting for the orchestrator agent to continue.',
    lastHumanInterventionAt: resumedAt,
    lastHumanInterventionSummary: 'Resumed the run.',
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
  return wakeOrchestratorRun(ctx, resumedRun, { runId: resumedRun.id, reason: 'resume' });
}

export async function completeOrchestratorTask(ctx: PluginContext, input: OrchestratorCompleteTaskInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.status === 'completed') {
    const run = await getRun(ctx, task.runId);
    return { run, task };
  }

  const now = Date.now();
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...current,
    status: 'completed',
    updatedAt: now,
  }));
  if (agentRun) {
    await updateAgentRun(ctx, agentRun.id, (current) => ({
      ...current,
      status: 'completed',
      completedAt: current.completedAt || now,
      lastEventAt: now,
      updatedAt: now,
    }));
    const artifactContent = getAgentRunArtifactContent(agentRun.sessionId);
    const existingArtifacts = await listArtifactsForRun(ctx, task.runId);
    const existingOutputArtifacts = existingArtifacts.filter((artifact) => artifact.agentRunId === agentRun.id);
    if (artifactContent && existingOutputArtifacts.length === 0) {
      await saveArtifact(ctx, {
        id: createId('artifact'),
        runId: task.runId,
        agentRunId: agentRun.id,
        taskId: task.id,
        stageId: task.stageId,
        stageName: task.stageName,
        agentId: task.agentId,
        agentName: task.agentName,
        name: `${task.agentName || task.title} Output`,
        logicalKey: buildArtifactLogicalKey(task),
        status: 'draft',
        version: task.attemptCount || 1,
        kind: guessArtifactKind(task),
        format: 'markdown',
        summary: buildArtifactSummary(task, artifactContent),
        content: artifactContent,
        createdAt: now,
        updatedAt: now,
      });
    }
    const runArtifacts = await listArtifactsForRun(ctx, task.runId);
    const outputArtifacts = runArtifacts.filter((artifact) => artifact.agentRunId === agentRun.id);
    await updateAgentRun(ctx, agentRun.id, (current) => ({
      ...current,
      output: {
        summary: outputArtifacts[0]?.summary || buildArtifactSummary(task, artifactContent || ''),
        artifactIds: outputArtifacts.map((artifact) => artifact.id),
        artifactSummaries: outputArtifacts.map((artifact) => artifact.summary),
        completedAt: now,
      },
      updatedAt: now,
    }));
  }
  const run = await getRun(ctx, task.runId);
  if (!run || !nextTask) return { run, task: nextTask };

  let nextStatus = run.status;
  const nextActiveTaskCount = Math.max(0, run.activeTaskCount - 1);
  if (run.status === 'pause_requested' && nextActiveTaskCount === 0) {
    nextStatus = 'paused';
  }

  let nextRun: OrchestratorRun = {
    ...run,
    activeTaskCount: nextActiveTaskCount,
    status: nextStatus,
    engineHealthSummary: nextStatus === 'paused'
      ? 'Run is paused and waiting for human action.'
      : nextActiveTaskCount > 0
        ? `Run is waiting on ${nextActiveTaskCount} active task(s).`
        : 'Run is ready for the orchestrator agent to continue.',
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

  if (task.parentTaskId) {
    if (task.kind === 'review') {
      const reviewContent = agentRun ? getAgentRunArtifactContent(agentRun.sessionId) : '';
      const reviewedArtifacts = await listReviewedArtifacts(ctx, task.runId, task.parentTaskId);
      const reviewResult = parseReviewDecision(reviewContent, reviewedArtifacts.length);
      const reviewLog: OrchestratorReviewLog = {
        id: createId('review'),
        runId: task.runId,
        stageId: task.stageId,
        stageName: task.stageName,
        taskId: task.id,
        parentTaskId: task.parentTaskId,
        agentRunId: agentRun?.id,
        reviewerName: task.agentName,
        decision: reviewResult.decision,
        summary: reviewResult.summary,
        feedback: reviewContent || reviewResult.summary,
        source: 'agent',
        reviewedArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
        createdAt: now,
        updatedAt: now,
      };
      await saveReviewLog(ctx, reviewLog);
      if (agentRun) {
        await updateAgentRun(ctx, agentRun.id, (current) => ({
          ...current,
          output: {
            decision: reviewResult.decision,
            summary: reviewResult.summary,
            feedback: reviewContent || reviewResult.summary,
            reviewedArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
            completedAt: now,
            source: 'agent',
          } satisfies ReviewAgentOutputSnapshot,
          updatedAt: now,
        }));
      }
      if (reviewResult.decision === 'approved') {
        await acceptStageArtifacts(ctx, task.runId, task.parentTaskId, reviewLog.id, now);
        await updateTask(ctx, task.parentTaskId, (current) => ({
          ...current,
          status: 'completed',
          updatedAt: now,
        }));
      } else {
        await updateTask(ctx, task.parentTaskId, (current) => ({
          ...current,
          status: 'blocked',
          summary: reviewResult.summary,
          updatedAt: now,
        }));
        nextStatus = 'paused';
        nextRun = {
          ...nextRun,
          status: 'paused',
          pausedAt: now,
          updatedAt: now,
        };
        await saveRun(ctx, nextRun);
      }
    } else if (task.kind === 'work') {
      await updateTask(ctx, task.parentTaskId, (current) => ({
        ...current,
        status: 'waiting_review',
        updatedAt: now,
      }));
    }
  }

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

  if (task.kind === 'review' && nextStatus === 'paused') {
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'run.updated',
      title: 'Review requested changes',
      detail: `${task.agentName || task.title} did not approve this stage. The run is paused for rework.`,
      createdAt: now,
    });
  }

  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  if (nextRun.status === 'running' && nextRun.activeTaskCount === 0) {
    const awakened = await wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'task_completed' });
    return { run: awakened, task: nextTask };
  }
  return { run: nextRun, task: nextTask };
}

export async function updateOrchestratorTask(ctx: PluginContext, input: OrchestratorUpdateTaskInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);

  const now = Date.now();
  const trimmedSummary = input.summary?.trim();
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...current,
    summary: trimmedSummary || current.summary,
    updatedAt: now,
  }));
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  if (agentRun && trimmedSummary) {
    await updateAgentRun(ctx, agentRun.id, (current) => ({
      ...current,
      prompt: rewriteAgentPrompt(current.prompt, trimmedSummary),
      updatedAt: now,
    }));
  }
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: task.runId,
    type: 'task.updated',
    title: 'Task updated by human',
    detail: trimmedSummary
      ? `${task.agentName || task.title} received an updated instruction.`
      : `${task.agentName || task.title} was reviewed by a human.`,
    createdAt: now,
  });
  const run = await getRun(ctx, task.runId);
  if (run) {
    await saveRun(ctx, {
      ...run,
      lastHumanInterventionAt: now,
      lastHumanInterventionSummary: trimmedSummary
        ? `Updated task ${task.agentName || task.title}.`
        : `Reviewed task ${task.agentName || task.title}.`,
      updatedAt: now,
    });
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: task.runId });
  return {
    task: nextTask,
    agentRun: agentRun ? await getAgentRunByTaskId(ctx, task.id) : null,
  };
}

export async function overrideReviewDecision(ctx: PluginContext, input: OrchestratorOverrideReviewInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  if (task.kind !== 'review' || !task.parentTaskId) {
    throw new Error(`Task is not a review task: ${input.taskId}`);
  }
  const run = await getRun(ctx, task.runId);
  if (!run) throw new Error(`Run not found: ${task.runId}`);
  const reviewAgentRun = await getAgentRunByTaskId(ctx, task.id);
  const now = Date.now();
  const reviewedArtifacts = await listReviewedArtifacts(ctx, task.runId, task.parentTaskId);
  const feedback = input.feedback?.trim() || buildHumanOverrideFeedback(input.decision, task);

  const reviewLog: OrchestratorReviewLog = {
    id: createId('review'),
    runId: task.runId,
    stageId: task.stageId,
    stageName: task.stageName,
    taskId: task.id,
    parentTaskId: task.parentTaskId,
    agentRunId: reviewAgentRun?.id,
    reviewerName: 'Human Reviewer',
    decision: input.decision,
    summary: summarizeReviewDecision(input.decision, true),
    feedback,
    source: 'human_override',
    overrideReason: feedback,
    overriddenAgentRunId: reviewAgentRun?.id,
    reviewedArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
    createdAt: now,
    updatedAt: now,
  };
  await saveReviewLog(ctx, reviewLog);

  if (reviewAgentRun) {
    await updateAgentRun(ctx, reviewAgentRun.id, (current) => ({
      ...current,
      output: {
        decision: input.decision,
        summary: reviewLog.summary,
        feedback,
        reviewedArtifactIds: reviewLog.reviewedArtifactIds,
        completedAt: now,
        source: 'human_override',
      },
      updatedAt: now,
    }));
  }

  await updateTask(ctx, task.id, (current) => ({
    ...current,
    status: 'completed',
    summary: reviewLog.summary,
    updatedAt: now,
  }));

  if (input.decision === 'approved') {
    await acceptStageArtifacts(ctx, task.runId, task.parentTaskId, reviewLog.id, now);
    await updateTask(ctx, task.parentTaskId, (current) => ({
      ...current,
      status: 'completed',
      summary: reviewLog.summary,
      updatedAt: now,
    }));
  } else {
    await updateTask(ctx, task.parentTaskId, (current) => ({
      ...current,
      status: 'blocked',
      summary: feedback,
      updatedAt: now,
    }));
  }

  const nextRun: OrchestratorRun = {
    ...run,
    status: input.decision === 'approved' ? 'running' : 'paused',
    engineHealthSummary: input.decision === 'approved'
      ? 'Human review approved the stage and orchestration can continue.'
      : 'Human review requested changes before orchestration can continue.',
    lastHumanInterventionAt: now,
    lastHumanInterventionSummary: `Human review marked ${task.stageName || task.title} as ${input.decision}.`,
    pausedAt: input.decision === 'approved' ? undefined : now,
    lastDecisionAt: now,
    lastDecisionSummary: reviewLog.summary,
    updatedAt: now,
  };
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'run.updated',
    title: input.decision === 'approved' ? 'Human reviewer approved this stage' : 'Human reviewer requested changes',
    detail: feedback,
    createdAt: now,
  });
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });

  if (input.decision === 'approved' && nextRun.activeTaskCount === 0) {
    return wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'user_request' });
  }

  return {
    run: nextRun,
    reviewLog,
  };
}

export async function retryOrchestratorTask(ctx: PluginContext, input: OrchestratorRetryTaskInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  const run = await getRun(ctx, task.runId);
  if (!run) throw new Error(`Run not found: ${task.runId}`);
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  if (!agentRun) throw new Error(`Agent run not found for task: ${task.id}`);

  const now = Date.now();
  const sessionId = `orchestrator-${run.id}-${task.agentId}-${task.id}-${now}`;
  const nextAgentRun: OrchestratorAgentRun = {
    ...agentRun,
    id: createId('agent_run'),
    sessionId,
    status: 'ready',
    error: undefined,
    startedAt: undefined,
    completedAt: undefined,
    lastEventAt: undefined,
    output: undefined,
    createdAt: now,
    updatedAt: now,
  };
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...current,
    status: 'ready',
    latestAgentRunId: nextAgentRun.id,
    sessionId,
    attemptCount: current.attemptCount + 1,
    source: 'rework',
    updatedAt: now,
  }));
  await saveAgentRun(ctx, nextAgentRun);
  if (task.parentTaskId) {
    await updateTask(ctx, task.parentTaskId, (current) => ({
      ...current,
      status: 'running',
      updatedAt: now,
    }));
  }
  const nextRun: OrchestratorRun = {
    ...run,
    status: 'running',
    pausedAt: undefined,
    pauseRequestedAt: undefined,
    activeTaskCount: isActiveTask(task) ? run.activeTaskCount : run.activeTaskCount + 1,
    updatedAt: now,
  };
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'task.updated',
    title: 'Task retried by human',
    detail: `${task.agentName || task.title} was sent back to execution.`,
    createdAt: now,
  });
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
  if (nextTask && nextAgentRun) {
    void startAgentRunSession(ctx, nextRun, nextTask, nextAgentRun, {
      title: `${nextAgentRun.agentName || nextAgentRun.title} · ${nextAgentRun.stageName || 'Retry'}`,
      prompt: `Retry the following orchestration assignment with the latest human guidance.\n\n${nextAgentRun.prompt}`,
      startedDetail: `${task.agentName || task.title} restarted after human retry.`,
    });
  }
  return { run: nextRun, task: nextTask, agentRun: nextAgentRun };
}

export async function skipOrchestratorTask(ctx: PluginContext, input: OrchestratorSkipTaskInput) {
  const task = await getTask(ctx, input.taskId);
  if (!task) throw new Error(`Task not found: ${input.taskId}`);
  const run = await getRun(ctx, task.runId);
  if (!run) throw new Error(`Run not found: ${task.runId}`);
  const agentRun = await getAgentRunByTaskId(ctx, task.id);

  if (task.sessionId && isActiveTask(task)) {
    await interruptAgentSession(task.sessionId);
  }

  const now = Date.now();
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...current,
    status: 'cancelled',
    updatedAt: now,
  }));
  const nextAgentRun = agentRun
    ? await updateAgentRun(ctx, agentRun.id, (current) => ({
      ...current,
      status: 'cancelled',
      completedAt: now,
      lastEventAt: now,
      updatedAt: now,
    }))
    : null;
  const nextRun: OrchestratorRun = {
    ...run,
    status: run.status === 'cancelled' ? 'cancelled' : 'running',
    activeTaskCount: Math.max(0, run.activeTaskCount - (isActiveTask(task) ? 1 : 0)),
    pausedAt: undefined,
    pauseRequestedAt: undefined,
    updatedAt: now,
  };
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'task.updated',
    title: 'Task skipped by human',
    detail: `${task.agentName || task.title} was skipped and the flow can continue.`,
    createdAt: now,
  });
  if (task.parentTaskId) {
    await updateTask(ctx, task.parentTaskId, (current) => ({
      ...current,
      status: task.kind === 'review' ? 'completed' : 'blocked',
      updatedAt: now,
    }));
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
  if (nextRun.status === 'running' && nextRun.activeTaskCount === 0) {
    const awakened = await wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'task_skipped' });
    return { run: awakened, task: nextTask, agentRun: nextAgentRun };
  }
  return { run: nextRun, task: nextTask, agentRun: nextAgentRun };
}

export async function failOrchestratorTask(ctx: PluginContext, taskId: string, error: unknown) {
  const task = await getTask(ctx, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status === 'failed' || task.status === 'completed' || task.status === 'cancelled') {
    const run = await getRun(ctx, task.runId);
    return { run, task };
  }
  const now = Date.now();
  const nextTask = await updateTask(ctx, task.id, (current) => ({
    ...current,
    status: 'failed',
    summary: error instanceof Error ? error.message : String(error),
    updatedAt: now,
  }));
  const run = await getRun(ctx, task.runId);
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  if (!run || !nextTask) return { run, task: nextTask };

  const nextActiveTaskCount = Math.max(0, run.activeTaskCount - 1);
  const nextStatus = task.failurePolicy === 'skip' ? 'running' : 'paused';
  const nextRun: OrchestratorRun = {
    ...run,
    activeTaskCount: nextActiveTaskCount,
    status: nextStatus,
    pausedAt: nextStatus === 'paused' ? now : run.pausedAt,
    lastDecisionAt: now,
    lastDecisionSummary:
      nextStatus === 'paused'
        ? `${task.agentName || task.title} failed and the run is paused.`
        : `${task.agentName || task.title} failed and was skipped.`,
    updatedAt: now,
  };
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'task.updated',
    title: 'Task failed',
    detail: `${task.agentName || task.title} failed: ${error instanceof Error ? error.message : String(error)}`,
    createdAt: now,
  });
  if (task.parentTaskId) {
    await updateTask(ctx, task.parentTaskId, (current) => ({
      ...current,
      status: 'paused',
      updatedAt: now,
    }));
  }
  if (agentRun) {
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'run.updated',
      title: nextStatus === 'paused' ? 'Run paused after failure' : 'Run continued after failure',
      detail: `${agentRun.agentName || agentRun.title} session: ${agentRun.sessionId}`,
      createdAt: now,
    });
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
  if (nextStatus === 'running' && nextRun.activeTaskCount === 0) {
    return wakeOrchestratorRun(ctx, nextRun, { runId: nextRun.id, reason: 'task_completed' });
  }
  return { run: nextRun, task: nextTask };
}

export async function interruptOrchestratorTask(ctx: PluginContext, taskId: string) {
  const task = await getTask(ctx, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (!isActiveTask(task)) {
    const run = await getRun(ctx, task.runId);
    return { run, task };
  }
  const now = Date.now();
  const run = await getRun(ctx, task.runId);
  const agentRun = await getAgentRunByTaskId(ctx, task.id);
  if (!run) return { run, task };

  if (run.status === 'cancelled') {
    const nextTask = await updateTask(ctx, task.id, (current) => ({
      ...current,
      status: 'cancelled',
      updatedAt: now,
    }));
    if (agentRun) {
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'cancelled',
        completedAt: now,
        lastEventAt: now,
        updatedAt: now,
      }));
    }
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: 'task.updated',
      title: 'Task cancelled',
      detail: `${task.agentName || task.title} was cancelled.`,
      createdAt: now,
    });
    return { run, task: nextTask };
  }

  if (run.status === 'pause_requested' || run.status === 'paused') {
    const nextTask = await updateTask(ctx, task.id, (current) => ({
      ...current,
      status: 'paused',
      updatedAt: now,
    }));
    if (agentRun) {
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'paused',
        lastEventAt: now,
        updatedAt: now,
      }));
    }
    const remainingActive = Math.max(0, run.activeTaskCount - 1);
    const nextRun: OrchestratorRun = {
      ...run,
      activeTaskCount: remainingActive,
      status: remainingActive === 0 ? 'paused' : 'pause_requested',
      pausedAt: remainingActive === 0 ? now : run.pausedAt,
      updatedAt: now,
    };
    await saveRun(ctx, nextRun);
    await appendRunEvent(ctx, {
      id: createId('evt'),
      runId: run.id,
      type: remainingActive === 0 ? 'run.paused' : 'task.updated',
      title: remainingActive === 0 ? 'Run paused' : 'Task paused',
      detail: remainingActive === 0
        ? 'All active tasks have reached a pause point.'
        : `${task.agentName || task.title} paused.`,
      createdAt: now,
    });
    if (task.parentTaskId) {
      await updateTask(ctx, task.parentTaskId, (current) => ({
        ...current,
        status: 'paused',
        updatedAt: now,
      }));
    }
    ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
    return { run: nextRun, task: nextTask };
  }

  return failOrchestratorTask(ctx, task.id, new Error('Agent run interrupted unexpectedly'));
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
  const tasks = await listTasksForRun(ctx, run.id);
  await Promise.all(
    tasks
      .filter((task) => isActiveTask(task) && task.sessionId)
      .map((task) => interruptAgentSession(task.sessionId!)),
  );
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: nextRun.id });
  return nextRun;
}

function isActiveTask(task: OrchestratorAgentTask) {
  if (task.nodeType === 'container') return false;
  return task.status === 'ready' || task.status === 'pending' || task.status === 'running';
}

function buildDispatchPlan(plan: OrchestratorConfirmedPlan, tasks: OrchestratorAgentTask[]) {
  for (const stage of plan.stages) {
    const stagePlan = evaluatePlanStage(stage, tasks);
    if (!stagePlan.completed) return stagePlan;
  }
  return {
    completed: true,
    dispatches: [] as Dispatch[],
    stageNames: [] as string[],
    activeCount: 0,
    currentStageId: undefined,
    currentStageName: undefined,
  };
}

function makeOrchestrationDecision(context: OrchestrationContext): OrchestrationDecision {
  const plan = buildDispatchPlan(context.run.confirmedPlan, context.tasks);
  const availableDispatches = context.availableSlots > 0 ? plan.dispatches.slice(0, context.availableSlots) : [];

  if (availableDispatches.length > 0) {
    return {
      status: 'dispatch',
      summary: availableDispatches.length === 1
        ? `Dispatch ${availableDispatches[0].agentName} in ${availableDispatches[0].stage.name}`
        : `Dispatch ${availableDispatches.length} agents across ${plan.stageNames.join(', ')}`,
      currentStageId: availableDispatches[0].stage.id,
      currentStageName: availableDispatches[0].stage.name,
      currentAgentId: availableDispatches[0].agentId,
      currentAgentName: availableDispatches[0].agentName,
      dispatches: availableDispatches.map((dispatch) => ({
        parentTaskId: dispatch.parentTask.id,
        stageId: dispatch.stage.id,
        stageName: dispatch.stage.name,
        stageGoal: dispatch.stage.goal,
        deliverables: [...dispatch.stage.deliverables],
        kind: dispatch.kind,
        agentId: dispatch.agentId,
        agentName: dispatch.agentName,
        goal: dispatch.goal,
      })),
    };
  }

  if (plan.activeCount > 0) {
    return {
      status: 'wait',
      summary: `Waiting for ${plan.activeCount} active task(s) in ${plan.currentStageName || 'the current stage'}.`,
      currentStageId: plan.currentStageId,
      currentStageName: plan.currentStageName,
      dispatches: [],
    };
  }

  if (plan.dispatches.length > 0 && context.availableSlots === 0) {
    return {
      status: 'throttle',
      summary: `Reached max concurrent tasks (${context.run.maxConcurrentTasks || 2}).`,
      currentStageId: plan.currentStageId,
      currentStageName: plan.currentStageName,
      dispatches: [],
    };
  }

  return {
    status: 'complete',
    summary: 'No executable stage found. Run completed.',
    dispatches: [],
  };
}

function buildOrchestrationInput(context: OrchestrationContext): OrchestrationInputSnapshot {
  const readyTaskTitles = context.tasks
    .filter((task) => task.status === 'ready')
    .map((task) => task.title);
  const blockedTaskTitles = context.tasks
    .filter((task) => task.status === 'blocked')
    .map((task) => task.title);
  const waitingReviewTaskTitles = context.tasks
    .filter((task) => task.status === 'waiting_review')
    .map((task) => task.title);
  return {
    runGoal: context.run.goal,
    planTitle: context.run.planTitle,
    planOverview: context.run.confirmedPlan.overview,
    wakeReason: context.wakeReason,
    currentStageName: context.run.currentStageName,
    activeTaskCount: context.activeTaskCount,
    availableSlots: context.availableSlots,
    readyTaskTitles,
    blockedTaskTitles,
    waitingReviewTaskTitles,
    latestReviewSummaries: context.reviewLogs.slice(0, 3).map((log) => `${log.decision}: ${log.summary}`),
    projectStateSummary: summarizeProjectState(context.projectState),
  };
}

function buildOrchestrationPrompt(input: OrchestrationInputSnapshot) {
  return [
    `You are the Orchestration Agent for the "${input.planTitle}" run.`,
    'Your only job is to advance the run according to the confirmed plan. Do not perform the work yourself.',
    `Run goal: ${input.runGoal}`,
    `Plan overview: ${input.planOverview}`,
    `Wake reason: ${input.wakeReason || 'system'}`,
    input.currentStageName ? `Current stage: ${input.currentStageName}` : null,
    `Active tasks: ${input.activeTaskCount}`,
    `Available slots: ${input.availableSlots}`,
    input.readyTaskTitles.length ? `Ready tasks:\n- ${input.readyTaskTitles.join('\n- ')}` : 'Ready tasks: none',
    input.blockedTaskTitles.length ? `Blocked tasks:\n- ${input.blockedTaskTitles.join('\n- ')}` : 'Blocked tasks: none',
    input.waitingReviewTaskTitles.length ? `Waiting review:\n- ${input.waitingReviewTaskTitles.join('\n- ')}` : 'Waiting review: none',
    input.latestReviewSummaries.length ? `Latest reviews:\n- ${input.latestReviewSummaries.join('\n- ')}` : 'Latest reviews: none',
    input.projectStateSummary.length ? `Project state:\n- ${input.projectStateSummary.join('\n- ')}` : 'Project state: none',
    'Decide whether to dispatch work, wait, throttle, or complete the run.',
  ].filter(Boolean).join('\n\n');
}

function buildOrchestrationDecisionRecord(
  decision: OrchestrationDecision,
  createdAt: number,
): OrchestrationDecisionRecord {
  return {
    status: decision.status,
    summary: decision.summary,
    dispatchCount: decision.dispatches.length,
    currentStageName: decision.currentStageName,
    currentAgentName: decision.currentAgentName,
    dispatchTitles: decision.dispatches.map((dispatch) => `${dispatch.agentName} -> ${dispatch.stageName}`),
    createdAt,
  };
}

function resolveDispatches(tasks: OrchestratorAgentTask[], decision: OrchestrationDecision): Dispatch[] {
  if (decision.status !== 'dispatch') return [];
  return decision.dispatches.map((dispatch) => {
    const parentTask = tasks.find((task) => task.id === dispatch.parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task not found for dispatch: ${dispatch.parentTaskId}`);
    }
    return {
      parentTask,
      stage: {
        id: dispatch.stageId,
        name: dispatch.stageName,
        goal: dispatch.stageGoal,
        deliverables: [...dispatch.deliverables],
      },
      kind: dispatch.kind,
      agentId: dispatch.agentId,
      agentName: dispatch.agentName,
      goal: dispatch.goal,
    };
  });
}

function evaluatePlanStage(stage: OrchestratorPlanStage, tasks: OrchestratorAgentTask[]) {
  const containerTask = findContainerTask(tasks, stage.id);
  if (!containerTask) {
    return {
      completed: false,
      activeCount: 0,
      dispatches: [] as Dispatch[],
      stageNames: [],
      currentStageId: stage.id,
      currentStageName: stage.name,
    };
  }

  const childTasks = tasks.filter((task) => task.parentTaskId === containerTask.id);
  const workTask = findLatestChildTask(childTasks, 'work');
  const reviewTask = findLatestChildTask(childTasks, 'review');
  const activeTasks = [workTask, reviewTask].filter((task): task is OrchestratorAgentTask => Boolean(task && isActiveTask(task)));

  if (activeTasks.length > 0) {
    return {
      completed: false,
      activeCount: activeTasks.length,
      dispatches: [] as Dispatch[],
      stageNames: [] as string[],
      currentStageId: stage.id,
      currentStageName: stage.name,
    };
  }

  if (!workTask) {
    const dispatch = createDispatch(containerTask, stage, 'work');
    return {
      completed: false,
      activeCount: 0,
      dispatches: [dispatch],
      stageNames: [stage.name],
      currentStageId: stage.id,
      currentStageName: stage.name,
    };
  }

  if (workTask.status !== 'completed') {
    return {
      completed: false,
      activeCount: 0,
      dispatches: [] as Dispatch[],
      stageNames: [],
      currentStageId: stage.id,
      currentStageName: stage.name,
    };
  }

  if (!reviewTask) {
    const dispatch = createDispatch(containerTask, stage, 'review');
    return {
      completed: false,
      activeCount: 0,
      dispatches: [dispatch],
      stageNames: [stage.name],
      currentStageId: stage.id,
      currentStageName: stage.name,
    };
  }

  if (reviewTask.status !== 'completed') {
    return {
      completed: false,
      activeCount: 0,
      dispatches: [] as Dispatch[],
      stageNames: [],
      currentStageId: stage.id,
      currentStageName: stage.name,
    };
  }

  return {
    completed: true,
    activeCount: 0,
    dispatches: [] as Dispatch[],
    stageNames: [],
    currentStageId: undefined,
    currentStageName: undefined,
  };
}

function findContainerTask(tasks: OrchestratorAgentTask[], stageId: string) {
  return tasks.find((task) => task.stageId === stageId && task.nodeType === 'container') || null;
}

function findLatestChildTask(tasks: OrchestratorAgentTask[], kind: 'work' | 'review') {
  return tasks
    .filter((task) => task.kind === kind)
    .sort((a, b) => b.order - a.order || b.createdAt - a.createdAt)[0] || null;
}

function createDispatch(parentTask: OrchestratorAgentTask, stage: OrchestratorPlanStage, kind: 'work' | 'review'): Dispatch {
  return {
    parentTask,
    stage,
    kind,
    agentId: `${stage.id}:${kind}`,
    agentName: kind === 'review' ? `${stage.name} Review Agent` : `${stage.name} Work Agent`,
    goal: kind === 'review'
      ? `Review the outputs of ${stage.name} against the confirmed plan and approval criteria.`
      : `${stage.goal}${stage.deliverables.length > 0 ? ` Deliverables: ${stage.deliverables.join(', ')}.` : ''}`,
  };
}

async function seedPlanTasks(ctx: PluginContext, run: OrchestratorRun, now: number) {
  for (const [index, stage] of run.confirmedPlan.stages.entries()) {
    const task: OrchestratorAgentTask = {
      id: createId('task'),
      runId: run.id,
      nodeType: 'container',
      rootTaskId: '',
      depth: 0,
      order: index,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: stage.id,
      stageName: stage.name,
      title: stage.name,
      status: index === 0 ? 'ready' : 'pending',
      summary: stage.goal,
      createdAt: now,
      updatedAt: now,
    };
    task.rootTaskId = task.id;
    await saveTask(ctx, task);
  }
}

function buildWorkAgentPrompt(input: OrchestratorAgentRun['input']) {
  if (!('acceptedArtifactSummaries' in input)) {
    throw new Error('Expected work agent input.');
  }
  return [
    `You are ${input.stageName || 'the current stage'} Work Agent inside the "${input.planTitle}" run.`,
    'You are not the user and you are not the orchestration agent. You are the specialist executor for one concrete assignment.',
    `Global run goal: ${input.runGoal}`,
    `Plan overview: ${input.planOverview}`,
    input.stageName ? `Current stage: ${input.stageName}` : null,
    input.stageGoal ? `Stage goal: ${input.stageGoal}` : null,
    input.taskSummary ? `Assignment summary from the orchestration agent: ${input.taskSummary}` : null,
    input.coordinatorBrief ? `Coordinator brief:\n${input.coordinatorBrief}` : null,
    input.deliverables.length ? `Expected deliverables:\n- ${input.deliverables.join('\n- ')}` : null,
    input.acceptedArtifactSummaries.length ? `Accepted project context you should build on:\n- ${input.acceptedArtifactSummaries.join('\n- ')}` : null,
    input.recentReviewSummaries.length ? `Recent review guidance to respect:\n- ${input.recentReviewSummaries.join('\n- ')}` : null,
    input.projectStateSummary.length ? `Current project state:\n- ${input.projectStateSummary.join('\n- ')}` : null,
    input.constraints.length ? `Constraints:\n- ${input.constraints.join('\n- ')}` : null,
    input.successCriteria.length ? `Success criteria:\n- ${input.successCriteria.join('\n- ')}` : null,
    `Review policy for this run: ${input.reviewPolicy}`,
    'Produce the actual stage output now. Do not talk about what you might do later.',
    'Work only on this stage. When you finish, provide the deliverable content itself plus a concise completion summary for downstream review.',
  ].filter(Boolean).join('\n\n');
}

function buildWorkAgentInput(
  run: OrchestratorRun,
  task: OrchestratorAgentTask,
  stage: OrchestratorPlanStage,
  projectState: OrchestratorProjectState | null,
  reviewLogs: OrchestratorReviewLog[],
  artifacts: OrchestratorArtifact[],
) {
  const projectStateSummary = summarizeProjectState(projectState);
  const acceptedArtifactSummaries = artifacts
    .filter((artifact) => artifact.status === 'accepted')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-6)
    .map((artifact) => `${artifact.stageName || 'Stage'}: ${artifact.summary}`);
  const recentReviewSummaries = reviewLogs
    .slice(0, 3)
    .map((log) => `${log.stageName || 'Stage'} (${log.decision}): ${log.summary}`);
  return {
    runGoal: run.goal,
    planTitle: run.planTitle,
    planOverview: run.confirmedPlan.overview,
    stageId: stage.id,
    stageName: stage.name,
    stageGoal: stage.goal,
    deliverables: [...stage.deliverables],
    constraints: [...run.confirmedPlan.constraints],
    successCriteria: [...run.confirmedPlan.successCriteria],
    reviewPolicy: run.confirmedPlan.reviewPolicy,
    taskSummary: task.summary,
    coordinatorBrief: buildWorkCoordinatorBrief(stage, task, acceptedArtifactSummaries, recentReviewSummaries),
    acceptedArtifactSummaries,
    recentReviewSummaries,
    projectStateSummary,
  };
}

async function buildReviewAgentInput(
  ctx: PluginContext,
  run: OrchestratorRun,
  task: OrchestratorAgentTask,
  stage: OrchestratorPlanStage,
) {
  const projectState = await getProjectState(ctx, run.id);
  const reviewedArtifacts = task.parentTaskId
    ? await listReviewedArtifacts(ctx, run.id, task.parentTaskId)
    : [];
  const recentReviewSummaries = (await listReviewLogsForRun(ctx, run.id))
    .slice(0, 3)
    .map((log) => `${log.stageName || 'Stage'} (${log.decision}): ${log.summary}`);
  return {
    runGoal: run.goal,
    planTitle: run.planTitle,
    planOverview: run.confirmedPlan.overview,
    stageId: stage.id,
    stageName: stage.name,
    stageGoal: stage.goal,
    deliverables: [...stage.deliverables],
    constraints: [...run.confirmedPlan.constraints],
    successCriteria: [...run.confirmedPlan.successCriteria],
    reviewPolicy: run.confirmedPlan.reviewPolicy,
    taskSummary: task.summary,
    coordinatorBrief: buildReviewCoordinatorBrief(stage, reviewedArtifacts),
    reviewedTaskId: task.parentTaskId,
    reviewedArtifactIds: reviewedArtifacts.map((artifact) => artifact.id),
    reviewedArtifactSummaries: reviewedArtifacts.map((artifact) => artifact.summary),
    recentReviewSummaries,
    projectStateSummary: summarizeProjectState(projectState),
  };
}

function buildReviewAgentPrompt(input: OrchestratorAgentRun['input']) {
  if (!('reviewedArtifactIds' in input)) {
    throw new Error('Expected review agent input.');
  }
  return [
    `You are ${input.stageName || 'the current stage'} Review Agent inside the "${input.planTitle}" run.`,
    'You are the quality gate for this stage. You do not rewrite the work; you judge whether it is ready to advance.',
    `Global run goal: ${input.runGoal}`,
    `Plan overview: ${input.planOverview}`,
    input.stageName ? `Current stage: ${input.stageName}` : null,
    input.stageGoal ? `Stage goal: ${input.stageGoal}` : null,
    input.taskSummary ? `Review assignment summary: ${input.taskSummary}` : null,
    input.coordinatorBrief ? `Coordinator brief:\n${input.coordinatorBrief}` : null,
    input.deliverables.length ? `Expected deliverables:\n- ${input.deliverables.join('\n- ')}` : null,
    input.reviewedArtifactSummaries.length
      ? `Artifacts under review:\n- ${input.reviewedArtifactSummaries.join('\n- ')}`
      : 'Artifacts under review: none were attached. Treat this as a serious quality issue unless the output is still directly visible in the transcript.',
    input.recentReviewSummaries.length ? `Recent review context:\n- ${input.recentReviewSummaries.join('\n- ')}` : null,
    input.projectStateSummary.length ? `Current accepted project state:\n- ${input.projectStateSummary.join('\n- ')}` : null,
    input.constraints.length ? `Constraints:\n- ${input.constraints.join('\n- ')}` : null,
    input.successCriteria.length ? `Success criteria:\n- ${input.successCriteria.join('\n- ')}` : null,
    `Review policy: ${input.reviewPolicy}`,
    'Decide strictly as approved, needs_changes, or rejected.',
    'If the output is insufficient, say exactly what must be fixed before the run should continue.',
  ].filter(Boolean).join('\n\n');
}

function getAgentRunArtifactContent(sessionId: string) {
  const session = useSessionStore.getState().sessions.get(sessionId);
  if (!session) return '';
  const assistantMessages = session.messages.filter((message) => message.role === 'assistant');
  const latest = assistantMessages[assistantMessages.length - 1];
  return latest?.content?.trim() || '';
}

function buildWorkCoordinatorBrief(
  stage: OrchestratorPlanStage,
  task: OrchestratorAgentTask,
  acceptedArtifactSummaries: string[],
  recentReviewSummaries: string[],
) {
  const notes = [
    `Complete the "${stage.name}" stage as a standalone assignment.`,
    task.summary ? `Focus specifically on: ${task.summary}` : null,
    acceptedArtifactSummaries.length
      ? 'Stay consistent with the already accepted project context instead of redefining it.'
      : 'This is the first accepted content for the run, so establish a strong foundation for later stages.',
    recentReviewSummaries.length
      ? 'Pay attention to recent review guidance so the next review can pass cleanly.'
      : 'Make the output review-ready on the first attempt.',
  ];
  return notes.filter(Boolean).join(' ');
}

function buildReviewCoordinatorBrief(
  stage: OrchestratorPlanStage,
  reviewedArtifacts: OrchestratorArtifact[],
) {
  return [
    `Audit the output for "${stage.name}" against the confirmed plan, not against generic writing quality alone.`,
    reviewedArtifacts.length
      ? 'Base your decision on the concrete artifacts attached to this review.'
      : 'No work artifacts were attached. Treat missing deliverables as a review concern.',
    'Only approve if the stage is strong enough for downstream stages to rely on.',
  ].join(' ');
}

function guessArtifactKind(task: OrchestratorAgentTask): OrchestratorArtifact['kind'] {
  if (task.kind === 'review') return 'report';
  const name = `${task.title} ${task.summary || ''}`.toLowerCase();
  if (name.includes('draft') || name.includes('write')) return 'draft';
  if (name.includes('note')) return 'notes';
  return 'summary';
}

function buildArtifactLogicalKey(task: OrchestratorAgentTask) {
  const stageKey = task.stageId || 'stage';
  const kindKey = task.kind || task.nodeType;
  return `${stageKey}.${kindKey}`;
}

function buildArtifactSummary(task: OrchestratorAgentTask, content: string) {
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean);
  return firstLine || task.summary || `${task.agentName || task.title} output`;
}

function parseReviewDecision(content: string, reviewedArtifactCount = 0) {
  const normalized = content.toLowerCase();
  if (
    containsAgentError(content)
    || reviewedArtifactCount === 0
  ) {
    return {
      decision: 'needs_changes' as const,
      summary: containsAgentError(content)
        ? 'Review could not complete successfully because the agent output contained an execution error.'
        : 'Review requested changes because no reviewed artifacts were attached to this stage.',
    };
  }
  if (
    normalized.includes('needs changes')
    || normalized.includes('need changes')
    || normalized.includes('requires changes')
    || normalized.includes('需要修改')
    || normalized.includes('需修改')
    || normalized.includes('打回')
  ) {
    return {
      decision: 'needs_changes' as const,
      summary: 'Review requested changes before the stage can continue.',
    };
  }
  if (
    normalized.includes('reject')
    || normalized.includes('rejected')
    || normalized.includes('不通过')
    || normalized.includes('未通过')
  ) {
    return {
      decision: 'rejected' as const,
      summary: 'Review rejected this stage output.',
    };
  }
  return {
    decision: 'approved' as const,
    summary: 'Review approved this stage output.',
  };
}

function containsAgentError(content: string) {
  const normalized = content.toLowerCase();
  return normalized.includes('[error:')
    || normalized.includes('llm error:')
    || normalized.includes('error sending request')
    || normalized.includes('api.minimaxi.com');
}

function summarizeReviewDecision(
  decision: 'approved' | 'needs_changes' | 'rejected',
  isHumanOverride = false,
) {
  const prefix = isHumanOverride ? 'Human review' : 'Review';
  if (decision === 'approved') return `${prefix} approved this stage output.`;
  if (decision === 'needs_changes') return `${prefix} requested changes before the stage can continue.`;
  return `${prefix} rejected this stage output.`;
}

function buildHumanOverrideFeedback(
  decision: 'approved' | 'needs_changes' | 'rejected',
  task: OrchestratorAgentTask,
) {
  if (decision === 'approved') {
    return `${task.stageName || task.title} was approved by a human reviewer.`;
  }
  if (decision === 'needs_changes') {
    return `${task.stageName || task.title} needs changes before execution can continue.`;
  }
  return `${task.stageName || task.title} was rejected by a human reviewer.`;
}

function summarizeProjectState(projectState: OrchestratorProjectState | null) {
  if (!projectState || projectState.entries.length === 0) return [];
  return projectState.entries.map((entry) => `${entry.label}: ${entry.summary}`);
}

async function listReviewedArtifacts(
  ctx: PluginContext,
  runId: string,
  parentTaskId: string,
) {
  const tasks = await listTasksForRun(ctx, runId);
  const artifacts = await listArtifactsForRun(ctx, runId);
  const workTaskIds = tasks
    .filter((candidate) => candidate.parentTaskId === parentTaskId && candidate.kind === 'work')
    .map((candidate) => candidate.id);
  return artifacts.filter((artifact) => workTaskIds.includes(artifact.taskId));
}

async function acceptStageArtifacts(
  ctx: PluginContext,
  runId: string,
  parentTaskId: string,
  reviewLogId: string,
  now: number,
) {
  const tasks = await listTasksForRun(ctx, runId);
  const stageTasks = tasks.filter((task) => task.parentTaskId === parentTaskId && task.kind === 'work');
  const artifacts = await listArtifactsForRun(ctx, runId);
  const targetArtifacts = artifacts.filter((artifact) => stageTasks.some((task) => task.id === artifact.taskId));

  for (const artifact of targetArtifacts) {
    for (const existing of artifacts.filter((item) => item.id !== artifact.id && item.logicalKey === artifact.logicalKey && item.status === 'accepted')) {
      await updateArtifact(ctx, existing.id, (current) => ({
        ...current,
        status: 'superseded',
        updatedAt: now,
      }));
    }
    await updateArtifact(ctx, artifact.id, (current) => ({
      ...current,
      status: 'accepted',
      acceptedByReviewLogId: reviewLogId,
      updatedAt: now,
    }));
  }

  await rebuildProjectState(ctx, runId, now);
}

async function rebuildProjectState(ctx: PluginContext, runId: string, now: number) {
  const artifacts = await listArtifactsForRun(ctx, runId);
  const acceptedArtifacts = artifacts.filter((artifact) => artifact.status === 'accepted');
  const current = await getProjectState(ctx, runId);
  const entries = acceptedArtifacts.map((artifact) => ({
    id: `${artifact.id}:entry`,
    logicalKey: artifact.logicalKey,
    label: artifact.name,
    artifactId: artifact.id,
    artifactKind: artifact.kind,
    stageId: artifact.stageId,
    stageName: artifact.stageName,
    summary: artifact.summary,
    updatedAt: artifact.updatedAt,
  }));
  const nextState: OrchestratorProjectState = {
    runId,
    entries,
    updatedAt: now,
  };
  if (!current || JSON.stringify(current.entries) !== JSON.stringify(nextState.entries) || current.updatedAt !== nextState.updatedAt) {
    await saveProjectState(ctx, nextState);
  }
}

export async function recoverOrchestratorRun(ctx: PluginContext, runId: string) {
  const run = await getRun(ctx, runId);
  if (!run || run.status === 'completed' || run.status === 'cancelled') return run;
  const tasks = await listTasksForRun(ctx, run.id);
  const agentRuns = await listAgentRunsForRun(ctx, run.id);

  for (const agentRun of agentRuns) {
    const task = tasks.find((item) => item.id === agentRun.taskId);
    if (!task) continue;
    if (!isActiveTask(task)) continue;
    if (run.status !== 'running') continue;
    if (isAgentSessionActive(agentRun.sessionId)) continue;
    void startAgentRunSession(ctx, run, task, agentRun, {
      title: `${agentRun.agentName || agentRun.title} · ${agentRun.stageName || 'Recovered'}`,
      prompt: `Resume the following orchestration assignment.\n\n${agentRun.prompt}`,
      startedDetail: `${agentRun.agentName || agentRun.title} resumed after recovery.`,
      preserveStartedAt: true,
    });
  }

  const refreshedRun = await getRun(ctx, run.id);
  if (refreshedRun?.status === 'running' && refreshedRun.activeTaskCount === 0) {
    return wakeOrchestratorRun(ctx, refreshedRun, { runId: refreshedRun.id, reason: 'system' });
  }
  return refreshedRun;
}

export async function watchdogOrchestratorRun(ctx: PluginContext, runId: string) {
  const run = await getRun(ctx, runId);
  if (!run) return null;

  const now = Date.now();
  if (run.status !== 'running' && run.status !== 'pause_requested') {
    const nextRun: OrchestratorRun = {
      ...run,
      watchdogStatus: run.status === 'cancelled' ? 'cancelled' : 'paused',
      watchdogCheckedAt: now,
      updatedAt: now,
    };
    await saveRun(ctx, nextRun);
    return nextRun;
  }

  const tasks = await listTasksForRun(ctx, run.id);
  const agentRuns = await listAgentRunsForRun(ctx, run.id);
  const activeTasks = tasks.filter((task) => isActiveTask(task));
  const staleAgentRun = activeTasks
    .map((task) => agentRuns.find((agentRun) => agentRun.taskId === task.id))
    .find((agentRun) => agentRun && now - (agentRun.lastEventAt || agentRun.updatedAt || 0) > MAX_WATCHDOG_IDLE_MS);

  if (!staleAgentRun) {
    if (run.watchdogStatus !== 'healthy' || !run.watchdogCheckedAt) {
      const nextRun: OrchestratorRun = {
        ...run,
        watchdogStatus: 'healthy',
        watchdogWarning: undefined,
        watchdogCheckedAt: now,
        updatedAt: now,
      };
      await saveRun(ctx, nextRun);
      ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
      return nextRun;
    }
    return run;
  }

  const warning = `${staleAgentRun.agentName || staleAgentRun.title} has been idle for more than ${Math.round(MAX_WATCHDOG_IDLE_MS / 60000)} minutes.`;
  const nextRun: OrchestratorRun = {
    ...run,
    status: 'paused',
    pausedAt: now,
    activeTaskCount: activeTasks.length,
    watchdogStatus: 'stalled',
    watchdogWarning: warning,
    watchdogCheckedAt: now,
    lastDecisionAt: now,
    lastDecisionSummary: warning,
    engineHealthSummary: 'Watchdog paused the run because an agent stopped producing events.',
    updatedAt: now,
  };
  await saveRun(ctx, nextRun);
  await appendRunEvent(ctx, {
    id: createId('evt'),
    runId: run.id,
    type: 'run.updated',
    title: 'Watchdog paused the run',
    detail: warning,
    createdAt: now,
  });
  if (staleAgentRun.sessionId) {
    await interruptAgentSession(staleAgentRun.sessionId);
  }
  ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
  return nextRun;
}

function rewriteAgentPrompt(prompt: string, summary: string) {
  return `${prompt}\n\nHuman update:\n${summary}`;
}

function startAgentRunSession(
  ctx: PluginContext,
  run: OrchestratorRun,
  task: OrchestratorAgentTask,
  agentRun: OrchestratorAgentRun,
  options: {
    title: string;
    prompt: string;
    startedDetail: string;
    preserveStartedAt?: boolean;
  },
) {
  return launchAgentSession({
    sessionId: agentRun.sessionId,
    title: options.title,
    prompt: options.prompt,
    parentSessionId: run.sourceSessionId,
    onStarted: async () => {
      const now = Date.now();
      await updateTask(ctx, task.id, (current) => ({
        ...current,
        status: 'running',
        updatedAt: now,
      }));
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'running',
        startedAt: options.preserveStartedAt ? current.startedAt || now : now,
        lastEventAt: now,
        updatedAt: now,
      }));
      await appendRunEvent(ctx, {
        id: createId('evt'),
        runId: run.id,
        type: 'task.updated',
        title: 'Agent started',
        detail: options.startedDetail,
        createdAt: now,
      });
      ctx.events.emit(ORCHESTRATOR_EVENTS.runsChanged, { runId: run.id });
    },
    onChunk: async () => {
      const now = Date.now();
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        lastEventAt: now,
        updatedAt: now,
      }));
    },
    onCompleted: async () => {
      const now = Date.now();
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'completed',
        completedAt: now,
        lastEventAt: now,
        updatedAt: now,
      }));
      await completeOrchestratorTask(ctx, { taskId: task.id });
    },
    onFailed: async (error) => {
      const now = Date.now();
      await updateAgentRun(ctx, agentRun.id, (current) => ({
        ...current,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        lastEventAt: now,
        updatedAt: now,
      }));
      await failOrchestratorTask(ctx, task.id, error);
    },
    onInterrupted: async () => {
      await interruptOrchestratorTask(ctx, task.id);
    },
  });
}
