import type {
  SpecApplyDecisionInput,
  SpecApplyExecutorResultInput,
  SpecApplyPlannerResultInput,
  SpecApplyReviewerResultInput,
  SpecAgentAssignment,
  SpecAgentResult,
  SpecChangeScaffoldInput,
  SpecRuntimeContext,
} from '../domain/contracts';
import {
  approveSpecHumanTask,
  applySpecExecutorResult,
  applySpecOrchestratorDecision,
  applySpecPlannerResult,
  applySpecReviewerResult,
  buildSpecExecutorAssignment,
  buildSpecOrchestratorAssignment,
  buildSpecPlannerAssignment,
  buildSpecReviewerAssignment,
  computeSpecNextActions,
  getSpecSnapshot,
  initializeSpecChange,
  pauseSpecRun,
  recoverSpecRun,
  retrySpecTask,
  resumeSpecRun,
  startSpecRun,
  watchdogSpecRun,
  failSpecTask,
} from '../application';
import { failSpecAgentSession, launchSpecAgentSession, listSpecAgentSessions, completeSpecAgentSession } from '../infra/agentSessionRuntime';
import { listSpecStates, loadSpecState, syncSpecStateFromDisk } from '../infra/storage';
import { readSpecTimeline } from '../infra/timeline';
import type { SpecAgentProfileId } from '../infra/agents';

export async function createSpecChangeCommand(ctx: SpecRuntimeContext, input: SpecChangeScaffoldInput) {
  return initializeSpecChange(ctx, input);
}

export async function listSpecChangesCommand(ctx: SpecRuntimeContext) {
  return listSpecStates(ctx.workspacePath);
}

export async function loadSpecChangeCommand(ctx: SpecRuntimeContext, slug: string) {
  return loadSpecState(ctx.workspacePath, slug);
}

export async function getSpecSnapshotCommand(ctx: SpecRuntimeContext, slug: string) {
  return getSpecSnapshot(ctx, slug);
}

export async function buildSpecOrchestratorAssignmentCommand(ctx: SpecRuntimeContext, slug: string) {
  const snapshot = await getSpecSnapshot(ctx, slug);
  return snapshot ? buildSpecOrchestratorAssignment(snapshot) : null;
}

export async function buildSpecPlannerAssignmentCommand(ctx: SpecRuntimeContext, slug: string) {
  const state = await loadSpecState(ctx.workspacePath, slug);
  if (!state) {
    return null;
  }
  return buildSpecPlannerAssignment({
    changeId: state.change.id,
    title: state.change.title,
    goal: state.change.goal,
    overview: state.change.overview,
    constraints: state.change.constraints,
    successCriteria: state.change.successCriteria,
    risks: state.change.risks,
  });
}

export async function buildSpecExecutorAssignmentCommand(ctx: SpecRuntimeContext, slug: string, taskId?: string) {
  const snapshot = await getSpecSnapshot(ctx, slug);
  return snapshot ? buildSpecExecutorAssignment(snapshot, taskId) : null;
}

export async function buildSpecReviewerAssignmentCommand(ctx: SpecRuntimeContext, slug: string, taskId?: string) {
  const snapshot = await getSpecSnapshot(ctx, slug);
  return snapshot ? buildSpecReviewerAssignment(snapshot, taskId) : null;
}

export async function getSpecTimelineCommand(ctx: SpecRuntimeContext, slug: string) {
  return readSpecTimeline(ctx.workspacePath, slug);
}

export async function syncSpecStateFromDiskCommand(ctx: SpecRuntimeContext, slug: string) {
  return syncSpecStateFromDisk(ctx, slug);
}

export async function startSpecRunCommand(ctx: SpecRuntimeContext, slug: string) {
  return startSpecRun(ctx, slug);
}

export async function computeSpecNextActionsCommand(ctx: SpecRuntimeContext, slug: string) {
  return computeSpecNextActions(ctx, slug);
}

export async function applySpecPlannerResultCommand(ctx: SpecRuntimeContext, slug: string, input: SpecApplyPlannerResultInput) {
  return applySpecPlannerResult(ctx, slug, input);
}

export async function applySpecOrchestratorDecisionCommand(ctx: SpecRuntimeContext, slug: string, input: SpecApplyDecisionInput) {
  return applySpecOrchestratorDecision(ctx, slug, input);
}

export async function applySpecExecutorResultCommand(ctx: SpecRuntimeContext, slug: string, input: SpecApplyExecutorResultInput) {
  return applySpecExecutorResult(ctx, slug, input);
}

export async function applySpecReviewerResultCommand(ctx: SpecRuntimeContext, slug: string, input: SpecApplyReviewerResultInput) {
  return applySpecReviewerResult(ctx, slug, input);
}

export async function pauseSpecRunCommand(ctx: SpecRuntimeContext, slug: string, runId: string, reason: string) {
  return pauseSpecRun(ctx, slug, runId, reason);
}

export async function resumeSpecRunCommand(ctx: SpecRuntimeContext, slug: string, runId: string) {
  return resumeSpecRun(ctx, slug, runId);
}

export async function recoverSpecRunCommand(ctx: SpecRuntimeContext, slug: string, runId: string) {
  return recoverSpecRun(ctx, slug, runId);
}

export async function watchdogSpecRunCommand(ctx: SpecRuntimeContext, slug: string, runId: string) {
  return watchdogSpecRun(ctx, slug, runId);
}

export async function retrySpecTaskCommand(ctx: SpecRuntimeContext, slug: string, taskId: string, summary?: string) {
  return retrySpecTask(ctx, slug, taskId, summary);
}

export async function approveSpecHumanTaskCommand(ctx: SpecRuntimeContext, slug: string, taskId: string, summary?: string) {
  return approveSpecHumanTask(ctx, slug, taskId, summary);
}

export async function failSpecTaskCommand(
  ctx: SpecRuntimeContext,
  slug: string,
  taskId: string,
  failure: Parameters<typeof failSpecTask>[3],
) {
  return failSpecTask(ctx, slug, taskId, failure);
}

export async function launchSpecAgentSessionCommand(
  ctx: SpecRuntimeContext,
  slug: string,
  profileId: SpecAgentProfileId,
  assignment: SpecAgentAssignment,
  title: string,
) {
  return launchSpecAgentSession({
    workspacePath: ctx.workspacePath,
    changeSlug: slug,
    profileId,
    assignment,
    title,
  });
}

export async function listSpecAgentSessionsCommand(ctx: SpecRuntimeContext, slug: string) {
  return listSpecAgentSessions(ctx.workspacePath, slug);
}

export async function completeSpecAgentSessionCommand(ctx: SpecRuntimeContext, slug: string, sessionId: string, result?: SpecAgentResult) {
  return completeSpecAgentSession(ctx.workspacePath, slug, sessionId, result);
}

export async function failSpecAgentSessionCommand(ctx: SpecRuntimeContext, slug: string, sessionId: string, error: string) {
  return failSpecAgentSession(ctx.workspacePath, slug, sessionId, error);
}
