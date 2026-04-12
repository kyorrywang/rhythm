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
  approveSpecHumanTaskCommand,
  applySpecExecutorResultCommand,
  applySpecOrchestratorDecisionCommand,
  applySpecPlannerResultCommand,
  applySpecReviewerResultCommand,
  buildSpecExecutorAssignmentCommand,
  buildSpecOrchestratorAssignmentCommand,
  buildSpecPlannerAssignmentCommand,
  buildSpecReviewerAssignmentCommand,
  computeSpecNextActionsCommand,
  createSpecChangeCommand,
  failSpecAgentSessionCommand,
  failSpecTaskCommand,
  getSpecSnapshotCommand,
  getSpecTimelineCommand,
  launchSpecAgentSessionCommand,
  listSpecChangesCommand,
  listSpecAgentSessionsCommand,
  loadSpecChangeCommand,
  pauseSpecRunCommand,
  recoverSpecRunCommand,
  retrySpecTaskCommand,
  resumeSpecRunCommand,
  syncSpecStateFromDiskCommand,
  startSpecRunCommand,
  watchdogSpecRunCommand,
  completeSpecAgentSessionCommand,
} from './commands';
import type { SpecAgentProfileId } from '../infra/agents';

export type SpecIntegrationAction =
  | { type: 'spec.create_change'; input: SpecChangeScaffoldInput }
  | { type: 'spec.list_changes' }
  | { type: 'spec.load_change'; slug: string }
  | { type: 'spec.snapshot'; slug: string }
  | { type: 'spec.timeline'; slug: string }
  | { type: 'spec.sync_from_disk'; slug: string }
  | { type: 'spec.build_orchestrator_assignment'; slug: string }
  | { type: 'spec.build_planner_assignment'; slug: string }
  | { type: 'spec.build_executor_assignment'; slug: string; taskId?: string }
  | { type: 'spec.build_reviewer_assignment'; slug: string; taskId?: string }
  | { type: 'spec.launch_agent_session'; slug: string; profileId: SpecAgentProfileId; assignment: SpecAgentAssignment; title: string }
  | { type: 'spec.list_agent_sessions'; slug: string }
  | { type: 'spec.complete_agent_session'; slug: string; sessionId: string; result?: SpecAgentResult }
  | { type: 'spec.fail_agent_session'; slug: string; sessionId: string; error: string }
  | { type: 'spec.start_run'; slug: string }
  | { type: 'spec.compute_next_actions'; slug: string }
  | { type: 'spec.apply_planner_result'; slug: string; input: SpecApplyPlannerResultInput }
  | { type: 'spec.apply_orchestrator_decision'; slug: string; input: SpecApplyDecisionInput }
  | { type: 'spec.apply_executor_result'; slug: string; input: SpecApplyExecutorResultInput }
  | { type: 'spec.apply_reviewer_result'; slug: string; input: SpecApplyReviewerResultInput }
  | { type: 'spec.retry_task'; slug: string; taskId: string; summary?: string }
  | { type: 'spec.fail_task'; slug: string; taskId: string; failure: Parameters<typeof failSpecTaskCommand>[3] }
  | { type: 'spec.approve_human_task'; slug: string; taskId: string; summary?: string }
  | { type: 'spec.pause_run'; slug: string; runId: string; reason: string }
  | { type: 'spec.resume_run'; slug: string; runId: string }
  | { type: 'spec.recover_run'; slug: string; runId: string }
  | { type: 'spec.watchdog_run'; slug: string; runId: string };

export async function dispatchSpecIntegrationAction(ctx: SpecRuntimeContext, action: SpecIntegrationAction) {
  switch (action.type) {
    case 'spec.create_change':
      return createSpecChangeCommand(ctx, action.input);
    case 'spec.list_changes':
      return listSpecChangesCommand(ctx);
    case 'spec.load_change':
      return loadSpecChangeCommand(ctx, action.slug);
    case 'spec.snapshot':
      return getSpecSnapshotCommand(ctx, action.slug);
    case 'spec.timeline':
      return getSpecTimelineCommand(ctx, action.slug);
    case 'spec.sync_from_disk':
      return syncSpecStateFromDiskCommand(ctx, action.slug);
    case 'spec.build_orchestrator_assignment':
      return buildSpecOrchestratorAssignmentCommand(ctx, action.slug);
    case 'spec.build_planner_assignment':
      return buildSpecPlannerAssignmentCommand(ctx, action.slug);
    case 'spec.build_executor_assignment':
      return buildSpecExecutorAssignmentCommand(ctx, action.slug, action.taskId);
    case 'spec.build_reviewer_assignment':
      return buildSpecReviewerAssignmentCommand(ctx, action.slug, action.taskId);
    case 'spec.launch_agent_session':
      return launchSpecAgentSessionCommand(ctx, action.slug, action.profileId, action.assignment, action.title);
    case 'spec.list_agent_sessions':
      return listSpecAgentSessionsCommand(ctx, action.slug);
    case 'spec.complete_agent_session':
      return completeSpecAgentSessionCommand(ctx, action.slug, action.sessionId, action.result);
    case 'spec.fail_agent_session':
      return failSpecAgentSessionCommand(ctx, action.slug, action.sessionId, action.error);
    case 'spec.start_run':
      return startSpecRunCommand(ctx, action.slug);
    case 'spec.compute_next_actions':
      return computeSpecNextActionsCommand(ctx, action.slug);
    case 'spec.apply_planner_result':
      return applySpecPlannerResultCommand(ctx, action.slug, action.input);
    case 'spec.apply_orchestrator_decision':
      return applySpecOrchestratorDecisionCommand(ctx, action.slug, action.input);
    case 'spec.apply_executor_result':
      return applySpecExecutorResultCommand(ctx, action.slug, action.input);
    case 'spec.apply_reviewer_result':
      return applySpecReviewerResultCommand(ctx, action.slug, action.input);
    case 'spec.retry_task':
      return retrySpecTaskCommand(ctx, action.slug, action.taskId, action.summary);
    case 'spec.fail_task':
      return failSpecTaskCommand(ctx, action.slug, action.taskId, action.failure);
    case 'spec.approve_human_task':
      return approveSpecHumanTaskCommand(ctx, action.slug, action.taskId, action.summary);
    case 'spec.pause_run':
      return pauseSpecRunCommand(ctx, action.slug, action.runId, action.reason);
    case 'spec.resume_run':
      return resumeSpecRunCommand(ctx, action.slug, action.runId);
    case 'spec.recover_run':
      return recoverSpecRunCommand(ctx, action.slug, action.runId);
    case 'spec.watchdog_run':
      return watchdogSpecRunCommand(ctx, action.slug, action.runId);
    default:
      return null;
  }
}
