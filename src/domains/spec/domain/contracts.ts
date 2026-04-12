import type { SpecArtifact, SpecPlanStage, SpecReviewFinding, SpecRun, SpecState, SpecTask } from './types';
import type { SpecAgentProfileId, SpecAgentRole } from '../infra/agents';

export interface SpecChangeScaffoldInput {
  title: string;
  goal: string;
  overview?: string;
  scope?: string[];
  constraints?: string[];
  successCriteria?: string[];
  nonGoals?: string[];
  risks?: string[];
  affectedAreas?: string[];
}

export interface SpecMarkdownSectionContract {
  key: 'status' | 'goal' | 'overview' | 'scope' | 'non_goals' | 'constraints' | 'risks' | 'success_criteria' | 'current' | 'blocked' | 'recent_updates';
  title: string;
  owner: 'system' | 'human' | 'shared';
}

export interface SpecMarkdownContract {
  managedSections: SpecMarkdownSectionContract[];
}

export interface SpecFileContract {
  stateSchemaVersion: 1;
  markdown: {
    change: SpecMarkdownContract;
    plan: SpecMarkdownContract;
    tasks: SpecMarkdownContract;
  };
}

export interface SpecAgentPromptContract {
  identity: string;
  job: string;
  forbidden: string[];
  outputRequirement: string;
  example: string;
}

export interface SpecAgentProfileContract {
  id: SpecAgentProfileId;
  role: SpecAgentRole;
  permissionMode: 'full_auto' | 'manual';
  allowedTools: string[];
  disallowedTools: string[];
  maxTurns: number;
  prompt: SpecAgentPromptContract;
}

export interface SpecOrchestrationActionDispatch {
  type: 'dispatch_task';
  taskId: string;
  profileId: SpecAgentProfileId;
}

export interface SpecOrchestrationActionRequestHuman {
  type: 'request_human';
  reason: string;
  taskId?: string;
}

export interface SpecOrchestrationActionCompleteChange {
  type: 'complete_change';
  summary: string;
}

export interface SpecOrchestrationActionWait {
  type: 'wait';
  reason: string;
}

export type SpecOrchestrationAction =
  | SpecOrchestrationActionDispatch
  | SpecOrchestrationActionRequestHuman
  | SpecOrchestrationActionCompleteChange
  | SpecOrchestrationActionWait;

export interface SpecOrchestratorDecision {
  kind: 'spec_orchestration_decision';
  summary: string;
  rationale: string[];
  action: SpecOrchestrationAction;
}

export interface SpecPlannerAssignment {
  role: 'planner';
  changeId: string;
  title: string;
  goal: string;
  overview: string;
  constraints: string[];
  successCriteria: string[];
  risks: string[];
}

export interface SpecExecutorAssignment {
  role: 'executor';
  changeId: string;
  runId: string;
  task: SpecTask;
  stage: SpecPlanStage | null;
  acceptedArtifacts: SpecArtifact[];
}

export interface SpecReviewerAssignment {
  role: 'reviewer';
  changeId: string;
  runId: string;
  task: SpecTask;
  artifacts: SpecArtifact[];
}

export type SpecAgentAssignment =
  | SpecPlannerAssignment
  | SpecExecutorAssignment
  | SpecReviewerAssignment;

export interface SpecPlannerResult {
  kind: 'spec_planner_result';
  summary: string;
  plan: {
    summary: string;
    approach: string;
    stages: Array<{
      id: string;
      name: string;
      goal: string;
      deliverables: string[];
      targetFolder: string;
      outputFiles: string[];
      requiresReview: boolean;
      humanCheckpointRequired: boolean;
    }>;
    checkpoints: string[];
    reviewStrategy: string[];
    openQuestions: string[];
  };
  taskBlueprints: Array<{
    id: string;
    title: string;
    kind: SpecTask['kind'];
    stageId: string | null;
    dependsOn: string[];
    acceptanceCriteria: string[];
    targetPaths: string[];
    reviewRequired: boolean;
    summary: string;
  }>;
}

export interface SpecExecutorResult {
  kind: 'spec_executor_result';
  summary: string;
  artifactDrafts: Array<{
    logicalKey: string;
    name: string;
    filePaths: string[];
    summary: string;
  }>;
}

export interface SpecReviewerResult {
  kind: 'spec_reviewer_result';
  summary: string;
  decision: 'accepted' | 'changes_requested' | 'blocked' | 'human_required';
  findings: SpecReviewFinding[];
  requiresRework: boolean;
}

export type SpecAgentResult = SpecPlannerResult | SpecExecutorResult | SpecReviewerResult;

export interface SpecRecoveryIntent {
  runId: string;
  strategy: 'resume_coordinator' | 'resume_task' | 'wait_for_human' | 'wait_for_review' | 'complete_run' | 'noop';
  reason: string;
}

export interface SpecRuntimeContext {
  workspacePath: string;
  ownerId?: string;
  now?: () => number;
}

export interface SpecApplyDecisionInput {
  state: SpecState;
  run: SpecRun;
  decision: SpecOrchestratorDecision;
}
