export type SpecChangeStatus =
  | 'draft'
  | 'planned'
  | 'ready'
  | 'running'
  | 'waiting_review'
  | 'waiting_human'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'archived';

export type SpecRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_review'
  | 'waiting_human'
  | 'pause_requested'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type SpecTaskStatus =
  | 'ready'
  | 'pending'
  | 'running'
  | 'blocked'
  | 'waiting_review'
  | 'waiting_human'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type SpecTaskKind = 'plan' | 'work' | 'review' | 'checkpoint' | 'rework';
export type SpecTaskNodeType = 'container' | 'leaf';
export type SpecTaskSource = 'user' | 'planner' | 'review_rework' | 'recovery';
export type SpecArtifactStatus = 'draft' | 'review_submitted' | 'accepted' | 'superseded' | 'rejected';
export type SpecArtifactKind = 'plan' | 'task_output' | 'review_snapshot' | 'summary' | 'note';
export type SpecReviewDecision = 'accepted' | 'changes_requested' | 'blocked' | 'human_required';
export type SpecFailureKind =
  | 'environment_unavailable'
  | 'insufficient_context'
  | 'review_deadlock'
  | 'non_converging_rework'
  | 'policy_conflict'
  | 'agent_runtime_error'
  | 'human_required';

export type SpecTaskFailurePolicy = 'fail' | 'pause' | 'retry' | 'skip';
export type SpecTaskRetryPolicy = 'manual' | 'auto_transient';

export interface SpecMaintenanceLease {
  ownerId: string;
  acquiredAt: number;
  heartbeatAt: number;
  expiresAt: number;
}

export interface SpecFailureState {
  kind: SpecFailureKind;
  summary: string;
  retryable: boolean;
  requiresHuman: boolean;
  recommendedAction: string;
  autoRetryAt?: number;
  taskId?: string;
  runId?: string;
  firstOccurredAt: number;
  lastOccurredAt: number;
  retryCount: number;
}

export interface SpecPendingHumanAction {
  kind: 'checkpoint' | 'review_override' | 'rework_approval' | 'failure_recovery';
  summary: string;
  taskId?: string;
  reviewId?: string;
  requestedAt: number;
}

export interface SpecPlanStage {
  id: string;
  name: string;
  goal: string;
  deliverables: string[];
  targetFolder: string;
  outputFiles: string[];
  requiresReview: boolean;
  humanCheckpointRequired: boolean;
  executorProfileId?: string;
  reviewerProfileId?: string;
}

export interface SpecChange {
  id: string;
  slug: string;
  title: string;
  status: SpecChangeStatus;
  goal: string;
  overview: string;
  scope: string[];
  nonGoals: string[];
  constraints: string[];
  risks: string[];
  successCriteria: string[];
  affectedAreas: string[];
  currentPlanVersion: number;
  currentRunId: string | null;
  currentTaskId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SpecPlan {
  changeId: string;
  version: number;
  summary: string;
  approach: string;
  stages: SpecPlanStage[];
  checkpoints: string[];
  reviewStrategy: string[];
  openQuestions: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SpecTask {
  id: string;
  changeId: string;
  runId: string | null;
  parentTaskId: string | null;
  rootTaskId: string;
  stageId: string | null;
  title: string;
  kind: SpecTaskKind;
  nodeType: SpecTaskNodeType;
  source: SpecTaskSource;
  status: SpecTaskStatus;
  failurePolicy: SpecTaskFailurePolicy;
  retryPolicy: SpecTaskRetryPolicy;
  assignedAgentProfileId: string | null;
  attemptCount: number;
  dependsOn: string[];
  acceptanceCriteria: string[];
  targetPaths: string[];
  summary: string;
  blockedReason?: string;
  reviewRequired: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SpecArtifact {
  id: string;
  changeId: string;
  runId: string | null;
  taskId: string | null;
  stageId: string | null;
  kind: SpecArtifactKind;
  status: SpecArtifactStatus;
  logicalKey: string;
  name: string;
  filePaths: string[];
  summary: string;
  content?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface SpecReviewFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  detail: string;
  targetPaths: string[];
}

export interface SpecReview {
  id: string;
  changeId: string;
  runId: string | null;
  taskId: string | null;
  artifactIds: string[];
  decision: SpecReviewDecision;
  summary: string;
  findings: SpecReviewFinding[];
  requiresRework: boolean;
  createdAt: number;
}

export interface SpecRun {
  id: string;
  changeId: string;
  status: SpecRunStatus;
  currentStageId: string | null;
  currentTaskId: string | null;
  activeTaskCount: number;
  pendingHumanAction?: SpecPendingHumanAction;
  failureState?: SpecFailureState;
  maintenanceLease?: SpecMaintenanceLease;
  engineHealthSummary: string;
  watchdogStatus: 'healthy' | 'paused' | 'warning' | 'cancelled';
  watchdogWarning?: string;
  watchdogCheckedAt?: number;
  lastWakeAt?: number;
  lastWakeReason?: 'start' | 'resume' | 'system' | 'task_completed' | 'task_skipped' | 'user_request';
  createdAt: number;
  updatedAt: number;
}

export interface SpecTaskProgress {
  total: number;
  completed: number;
  running: number;
  blocked: number;
  waitingReview: number;
  waitingHuman: number;
  currentTaskTitle: string | null;
}

export interface SpecArtifactProgress {
  accepted: number;
  draft: number;
  rejected: number;
}

export interface SpecExecutionState {
  activeAgentProfileId: string | null;
  maintenanceLeaseOwnerId: string | null;
}

export interface SpecState {
  schemaVersion: 1;
  mode: 'spec';
  change: SpecChange;
  plan: SpecPlan;
  tasks: SpecTask[];
  artifacts: SpecArtifact[];
  reviews: SpecReview[];
  runs: SpecRun[];
  metrics: {
    tasks: SpecTaskProgress;
    artifacts: SpecArtifactProgress;
  };
  execution: SpecExecutionState;
  createdAt: number;
  updatedAt: number;
}

export interface SpecTimelineEvent<TPayload = Record<string, unknown>> {
  id: string;
  changeId: string;
  runId?: string;
  taskId?: string;
  type:
    | 'change.created'
    | 'change.updated'
    | 'plan.created'
    | 'plan.updated'
    | 'task.created'
    | 'task.updated'
    | 'task.dispatched'
    | 'task.started'
    | 'task.completed'
    | 'task.failed'
    | 'review.recorded'
    | 'artifact.recorded'
    | 'run.created'
    | 'run.started'
    | 'run.updated'
    | 'run.paused'
    | 'run.resumed'
    | 'run.completed'
    | 'run.failed'
    | 'run.cancelled'
    | 'lease.acquired'
    | 'lease.released';
  title: string;
  detail: string;
  payload?: TPayload;
  createdAt: number;
}

export interface SpecRuntimeSnapshot {
  state: SpecState;
  activeRun: SpecRun | null;
  currentTask: SpecTask | null;
  readyTasks: SpecTask[];
  liveTasks: SpecTask[];
  pendingReviews: SpecTask[];
  pendingHumanTasks: SpecTask[];
}
