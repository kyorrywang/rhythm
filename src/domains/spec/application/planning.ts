import { SPEC_AGENT_PROFILE_IDS } from '../infra/agents';
import type {
  SpecApplyPlannerResultInput,
  SpecPlannerAssignment,
  SpecRuntimeContext,
} from '../domain/contracts';
import { assertValidSpecPlannerResult } from '../domain/validation';
import { appendSpecTimelineEvent, updateSpecState } from '../infra/storage';
import { createSpecTimelineEvent } from '../infra/timeline';
import type { SpecTask } from '../domain/types';
import { createSpecId, getActiveSpecRun, getSpecNow } from './orchestration';

function createPlannerTaskBlueprint(input: SpecApplyPlannerResultInput, eventTime: number) {
  const runId = input.state.change.currentRunId;
  return input.result.taskBlueprints.map<SpecTask>((blueprint) => {
    const taskId = blueprint.id || createSpecId('spec_task');
    return {
      id: taskId,
      changeId: input.state.change.id,
      runId,
      parentTaskId: null,
      rootTaskId: taskId,
      stageId: blueprint.stageId,
      title: blueprint.title,
      kind: blueprint.kind,
      nodeType: 'leaf',
      source: 'planner',
      status: blueprint.dependsOn.length === 0 ? 'ready' : 'pending',
      failurePolicy: 'pause',
      retryPolicy: 'manual',
      assignedAgentProfileId: null,
      attemptCount: 0,
      dependsOn: blueprint.dependsOn,
      acceptanceCriteria: blueprint.acceptanceCriteria,
      targetPaths: blueprint.targetPaths,
      summary: blueprint.summary,
      reviewRequired: blueprint.reviewRequired,
      createdAt: eventTime,
      updatedAt: eventTime,
    };
  });
}

export function buildSpecPlannerAssignment(input: {
  changeId: string;
  title: string;
  goal: string;
  overview: string;
  constraints: string[];
  successCriteria: string[];
  risks: string[];
}): SpecPlannerAssignment {
  return {
    role: 'planner',
    changeId: input.changeId,
    title: input.title,
    goal: input.goal,
    overview: input.overview,
    constraints: input.constraints,
    successCriteria: input.successCriteria,
    risks: input.risks,
  };
}

export async function applySpecPlannerResult(
  ctx: SpecRuntimeContext,
  slug: string,
  input: SpecApplyPlannerResultInput,
) {
  assertValidSpecPlannerResult(input.result);
  const eventTime = getSpecNow(ctx);
  const nextState = await updateSpecState(ctx, slug, (current) => {
    const plannerTasks = createPlannerTaskBlueprint({
      state: current,
      result: input.result,
    }, eventTime);
    const activeRun = getActiveSpecRun(current);
    const nextPlanVersion = current.plan.version + 1;
    return {
      ...current,
      change: {
        ...current.change,
        status: plannerTasks.length > 0 ? 'ready' : 'planned',
        currentPlanVersion: nextPlanVersion,
        updatedAt: eventTime,
      },
      plan: {
        ...current.plan,
        version: nextPlanVersion,
        summary: input.result.plan.summary,
        approach: input.result.plan.approach,
        stages: input.result.plan.stages,
        checkpoints: input.result.plan.checkpoints,
        reviewStrategy: input.result.plan.reviewStrategy,
        openQuestions: input.result.plan.openQuestions,
        updatedAt: eventTime,
      },
      tasks: plannerTasks,
      runs: current.runs.map((run) => run.id === activeRun?.id
        ? {
          ...run,
          status: plannerTasks.length > 0 ? 'pending' : run.status,
          currentStageId: plannerTasks[0]?.stageId || null,
          currentTaskId: null,
          activeTaskCount: 0,
          engineHealthSummary: input.result.summary,
          updatedAt: eventTime,
        }
        : run),
      execution: {
        ...current.execution,
        activeAgentProfileId: SPEC_AGENT_PROFILE_IDS.orchestrator,
      },
      updatedAt: eventTime,
    };
  });

  await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
    state: nextState,
    type: 'plan.updated',
    title: 'Plan updated',
    detail: input.result.summary,
    payload: { stages: input.result.plan.stages.length, tasks: input.result.taskBlueprints.length },
    createdAt: eventTime,
  }));

  if (input.result.taskBlueprints.length > 0) {
    await appendSpecTimelineEvent(ctx.workspacePath, slug, createSpecTimelineEvent({
      state: nextState,
      type: 'task.created',
      title: 'Tasks created',
      detail: `${input.result.taskBlueprints.length} task(s) prepared from the plan.`,
      payload: { taskIds: input.result.taskBlueprints.map((task) => task.id) },
      createdAt: eventTime,
    }));
  }

  return nextState;
}
