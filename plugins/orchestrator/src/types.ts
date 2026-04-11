import type { StreamRuntime } from '../../../src/shared/types/schema';

export type OrchestratorRunStatus =
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

export type OrchestratorTaskStatus =
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

export type OrchestratorTaskNodeType = 'container' | 'work' | 'review' | 'checkpoint';
export type OrchestratorTaskSource = 'plan_seed' | 'orchestrator_split' | 'rework';

export type OrchestratorExecutionMode = 'direct' | 'workflow';
export type OrchestratorArtifactStatus = 'draft' | 'review_submitted' | 'accepted' | 'superseded' | 'rejected';
export type OrchestratorFailureKind =
  | 'environment_unavailable'
  | 'insufficient_context'
  | 'review_deadlock'
  | 'non_converging_rework'
  | 'policy_conflict'
  | 'agent_runtime_error'
  | 'human_required';

export interface OrchestratorToolPolicy {
  permissionMode: 'full_auto' | 'manual';
}

export interface OrchestratorExecutionContext {
  providerId?: string;
  model?: string;
  reasoning?: string;
  workspacePath: string;
  toolPolicy?: OrchestratorToolPolicy;
  capturedAt: number;
}

export interface OrchestratorFailureState {
  kind: OrchestratorFailureKind;
  summary: string;
  retryable: boolean;
  requiresHuman: boolean;
  recommendedAction: string;
  autoRetryAt?: number;
  taskId?: string;
  agentRunId?: string;
  firstOccurredAt: number;
  lastOccurredAt: number;
  retryCount: number;
  runtime?: StreamRuntime;
}

export interface OrchestratorPendingHumanAction {
  kind: 'checkpoint' | 'review_override' | 'rework_approval' | 'failure_recovery';
  summary: string;
  taskId?: string;
  reviewLogId?: string;
  requestedAt: number;
}

export interface OrchestratorRunMetrics {
  totalTasks: number;
  completedTasks: number;
  acceptedArtifacts: number;
  reviewCount: number;
  lastComputedAt: number;
}

export interface OrchestratorMaintenanceLease {
  ownerId: string;
  acquiredAt: number;
  heartbeatAt: number;
  expiresAt: number;
}

export interface OrchestratorTemplate {
  schemaVersion?: number;
  id: string;
  name: string;
  domain: string;
  version: string;
  description?: string;
  parameters?: OrchestratorTemplateParameter[];
  stageRows: OrchestratorStageRow[];
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorTemplateParameter {
  id: string;
  name: string;
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
}

export interface OrchestratorPlanStage {
  id: string;
  name: string;
  goal: string;
  deliverables: string[];
  targetFolder: string;
  outputFiles: string[];
  executorName?: string;
  reviewerName?: string;
  executorTools?: string[];
  reviewerTools?: string[];
  executorSkills?: string[];
  reviewerSkills?: string[];
  failurePolicy?: OrchestratorAgent['failurePolicy'];
}

export interface OrchestratorStagePolicy {
  stageId: string;
  stageName: string;
  requiresReview: boolean;
  humanCheckpointRequired: boolean;
}

export interface OrchestratorReviewPolicy {
  schemaVersion?: number;
  runId?: string;
  defaultRequiresReview: boolean;
  allowHumanOverride: boolean;
  stagePolicies: OrchestratorStagePolicy[];
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorPlanDraft {
  schemaVersion?: number;
  id: string;
  revision?: number;
  title: string;
  goal: string;
  sourceSessionId?: string;
  sourceMessageId?: string;
  status: 'draft' | 'confirmed';
  overview: string;
  constraints: string[];
  successCriteria: string[];
  decompositionPrinciples: string[];
  humanCheckpoints: string[];
  reviewCheckpoints: string[];
  reviewPolicy: string;
  stages: OrchestratorPlanStage[];
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
  runId?: string;
}

export interface OrchestratorConfirmedPlan {
  id: string;
  revision?: number;
  title: string;
  goal: string;
  overview: string;
  constraints: string[];
  successCriteria: string[];
  decompositionPrinciples: string[];
  humanCheckpoints: string[];
  reviewCheckpoints: string[];
  reviewPolicy: string;
  stages: OrchestratorPlanStage[];
  confirmedAt: number;
}

export interface OrchestratorStageRow {
  id: string;
  stages: OrchestratorStage[];
}

export interface OrchestratorStage {
  id: string;
  name: string;
  goal: string;
  description?: string;
  agentRows: OrchestratorAgentRow[];
}

export interface OrchestratorAgentRow {
  id: string;
  agents: OrchestratorAgent[];
}

export interface OrchestratorAgent {
  id: string;
  name: string;
  role: string;
  goal: string;
  description?: string;
  executionMode: OrchestratorExecutionMode;
  workflowId?: string;
  allowSubAgents: boolean;
  tools: string[];
  skills: string[];
  inputSources: string[];
  outputArtifacts: string[];
  completionCondition?: string;
  failurePolicy: 'fail' | 'pause' | 'retry' | 'skip';
}

export interface OrchestratorRun {
  schemaVersion?: number;
  id: string;
  planId: string;
  planRevision?: number;
  planTitle: string;
  confirmedPlan: OrchestratorConfirmedPlan;
  goal: string;
  executionContext?: OrchestratorExecutionContext;
  sourceSessionId?: string;
  status: OrchestratorRunStatus;
  source: 'chat' | 'workbench' | 'system';
  currentStageId?: string;
  currentStageName?: string;
  currentAgentId?: string;
  currentAgentName?: string;
  activeTaskCount: number;
  maxConcurrentTasks?: number;
  watchdogStatus?: 'healthy' | 'stalled' | 'paused' | 'cancelled';
  watchdogWarning?: string;
  watchdogCheckedAt?: number;
  lastWakeAt?: number;
  lastWakeReason?: 'start' | 'resume' | 'task_completed' | 'task_skipped' | 'user_request' | 'system';
  lastDecisionAt?: number;
  lastDecisionSummary?: string;
  engineHealthSummary?: string;
  lastHumanInterventionAt?: number;
  lastHumanInterventionSummary?: string;
  pendingHumanCheckpoint?: string;
  pendingHumanAction?: OrchestratorPendingHumanAction;
  failureState?: OrchestratorFailureState;
  currentOrchestratorAgentRunId?: string;
  lastOrchestratorAgentRunId?: string;
  orchestrationInput?: OrchestrationInputSnapshot;
  orchestrationPrompt?: string;
  orchestrationDecision?: OrchestrationDecisionRecord;
  maintenanceLease?: OrchestratorMaintenanceLease;
  metrics?: OrchestratorRunMetrics;
  pauseRequestedAt?: number;
  pausedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorRunEvent {
  schemaVersion?: number;
  id: string;
  runId: string;
  type:
    | 'run.created'
    | 'run.started'
    | 'run.pause_requested'
    | 'run.paused'
    | 'run.resumed'
    | 'run.updated'
    | 'template.matched'
    | 'agent.wake'
    | 'agent.decision'
    | 'task.created'
    | 'task.updated';
  title: string;
  detail?: string;
  createdAt: number;
}

export interface OrchestratorAgentTask {
  schemaVersion?: number;
  id: string;
  runId: string;
  nodeType: OrchestratorTaskNodeType;
  kind?: 'work' | 'review' | 'checkpoint';
  parentTaskId?: string;
  rootTaskId: string;
  depth: number;
  order: number;
  source: OrchestratorTaskSource;
  latestAgentRunId?: string;
  attemptCount: number;
  assignedAgentType?: 'work' | 'review' | 'checkpoint' | 'orchestrator';
  retryPolicy?: 'never' | 'manual' | 'auto_transient';
  sessionId?: string;
  stageId?: string;
  planStageId?: string;
  stageName?: string;
  agentId?: string;
  agentName?: string;
  title: string;
  status: OrchestratorTaskStatus;
  objective?: string;
  inputs?: string[];
  expectedOutputs?: string[];
  priority?: number;
  reviewRequired?: boolean;
  reviewSatisfiedAt?: number;
  blockedReason?: string;
  targetFolder?: string;
  expectedFiles?: string[];
  dependencyTaskIds?: string[];
  requiresHumanApproval?: boolean;
  summary?: string;
  latestArtifactIds?: string[];
  latestReviewLogId?: string;
  failurePolicy?: OrchestratorAgent['failurePolicy'];
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorAgentRun {
  schemaVersion?: number;
  id: string;
  runId: string;
  taskId: string;
  planId: string;
  kind: 'work' | 'review';
  stageId?: string;
  stageName?: string;
  agentId?: string;
  agentName?: string;
  sessionId: string;
  title: string;
  prompt: string;
  input: WorkAgentInputSnapshot | ReviewAgentInputSnapshot;
  output?: WorkAgentOutputSnapshot | ReviewAgentOutputSnapshot;
  status: OrchestratorTaskStatus;
  runtime?: StreamRuntime;
  startedAt?: number;
  completedAt?: number;
  lastEventAt?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorCoordinatorRun {
  schemaVersion?: number;
  id: string;
  runId: string;
  sessionId: string;
  title: string;
  prompt: string;
  wakeReason?: OrchestratorWakeRunInput['reason'];
  input: OrchestrationInputSnapshot;
  decision?: OrchestrationDecisionRecord;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  runtime?: StreamRuntime;
  startedAt?: number;
  completedAt?: number;
  lastEventAt?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AssignmentBrief {
  assignmentId: string;
  runId: string;
  taskId?: string;
  kind: 'work' | 'review';
  title: string;
  whyNow: string;
  goal: string;
  context: string[];
  inputArtifacts: string[];
  instructions: string[];
  acceptanceCriteria: string[];
  deliverables: string[];
  targetFolder: string;
  expectedFiles: string[];
  reviewTargetPaths: string[];
  reviewFocus: string[];
  risks: string[];
  createdAt: number;
}

export interface OrchestratorArtifact {
  schemaVersion?: number;
  id: string;
  runId: string;
  agentRunId: string;
  taskId: string;
  stageId?: string;
  stageName?: string;
  agentId?: string;
  agentName?: string;
  name: string;
  logicalKey: string;
  status: OrchestratorArtifactStatus;
  version: number;
  kind: 'summary' | 'draft' | 'report' | 'notes';
  format: 'text' | 'markdown' | 'json';
  filePaths: string[];
  summary: string;
  acceptedByReviewLogId?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorProjectStateEntry {
  id: string;
  logicalKey: string;
  label: string;
  artifactId: string;
  artifactKind: OrchestratorArtifact['kind'];
  filePaths: string[];
  stageId?: string;
  stageName?: string;
  summary: string;
  updatedAt: number;
}

export interface OrchestratorProjectState {
  schemaVersion?: number;
  runId: string;
  entries: OrchestratorProjectStateEntry[];
  structureSummary?: string[];
  dependencySummary?: string[];
  updatedAt: number;
}

export interface WorkAgentInputSnapshot {
  assignmentBrief: AssignmentBrief;
  runGoal: string;
  planTitle: string;
  stageId?: string;
  stageName?: string;
  constraints: string[];
  targetFolder: string;
  expectedFiles: string[];
  acceptedArtifactSummaries: string[];
  recentReviewSummaries: string[];
  projectStateSummary: string[];
}

export interface WorkAgentOutputSnapshot {
  summary: string;
  artifactIds: string[];
  artifactSummaries: string[];
  completedAt: number;
}

export interface ReviewAgentInputSnapshot {
  assignmentBrief: AssignmentBrief;
  runGoal: string;
  planTitle: string;
  stageId?: string;
  stageName?: string;
  constraints: string[];
  targetFolder: string;
  expectedFiles: string[];
  reviewedTaskId?: string;
  reviewedArtifactIds: string[];
  reviewedArtifactSummaries: string[];
  reviewedArtifactPaths: string[];
  reviewedArtifactContents: string[];
  projectStateSummary: string[];
}

export interface ReviewAgentOutputSnapshot {
  decision: 'approved' | 'needs_changes' | 'rejected';
  summary: string;
  feedback: string;
  issues: string[];
  requiredRework: string[];
  confidence?: number;
  reviewedArtifactIds: string[];
  completedAt: number;
  source: 'agent' | 'human_override';
}

export interface OrchestrationContext {
  run: OrchestratorRun;
  wakeReason?: OrchestratorWakeRunInput['reason'];
  tasks: OrchestratorAgentTask[];
  reviewLogs: OrchestratorReviewLog[];
  projectState: OrchestratorProjectState | null;
  artifacts: OrchestratorArtifact[];
  activeTaskCount: number;
  availableSlots: number;
}

export interface OrchestrationDispatchDecision {
  parentTaskId: string;
  stageId: string;
  stageName: string;
  kind: 'work' | 'review';
  agentId: string;
  agentName: string;
  assignmentBrief: AssignmentBrief;
}

export interface OrchestrationDecision {
  status: 'dispatch' | 'wait' | 'throttle' | 'complete';
  summary: string;
  ruleHits?: string[];
  risks?: string[];
  requiresHuman?: boolean;
  taskOperations: OrchestrationTaskOperation[];
  currentStageId?: string;
  currentStageName?: string;
  currentAgentId?: string;
  currentAgentName?: string;
  dispatches: OrchestrationDispatchDecision[];
}

export interface OrchestrationInputSnapshot {
  runGoal: string;
  planTitle: string;
  planOverview: string;
  decompositionPrinciples: string[];
  humanCheckpoints: string[];
  reviewCheckpoints: string[];
  reviewPolicy: string;
  structuredReviewPolicy?: OrchestratorReviewPolicy;
  wakeReason?: OrchestratorWakeRunInput['reason'];
  currentStageId?: string;
  currentStageName?: string;
  currentStageTargetFolder?: string;
  currentStageOutputFiles: string[];
  currentStageReviewableOutputPaths: string[];
  currentStageDraftOutputSummaries: string[];
  currentStageAllowedDispatchKinds: Array<'work' | 'review'>;
  activeTaskCount: number;
  availableSlots: number;
  readyTaskTitles: string[];
  blockedTaskTitles: string[];
  waitingReviewTaskTitles: string[];
  latestReviewSummaries: string[];
  projectStateSummary: string[];
  actionableTasks: string[];
  candidateDispatches: string[];
}

export interface OrchestrationDecisionRecord {
  status: OrchestrationDecision['status'];
  summary: string;
  inputSummary: string[];
  dispatchCount: number;
  candidateActionCount: number;
  currentStageId?: string;
  currentStageName?: string;
  currentAgentId?: string;
  currentAgentName?: string;
  requiresHuman: boolean;
  ruleHits: string[];
  risks: string[];
  allowedDispatchKinds: Array<'work' | 'review'>;
  candidateDispatches: string[];
  selectedParentTaskIds: string[];
  dispatchTitles: string[];
  assignmentTitles: string[];
  assignments: AssignmentBrief[];
  taskOperationTypes: OrchestrationTaskOperation['type'][];
  taskOperationSummaries: string[];
  createdAt: number;
}

export interface OrchestrationTaskOperation {
  type: 'wait' | 'complete_run' | 'activate_task' | 'block_task' | 'reprioritize_task' | 'create_task' | 'create_checkpoint';
  taskId?: string;
  parentTaskId?: string;
  note?: string;
  priority?: number;
  title?: string;
  summary?: string;
  targetFolder?: string;
  expectedFiles?: string[];
  dependencyTaskIds?: string[];
  requiresHumanApproval?: boolean;
}

export interface OrchestratorReviewLog {
  schemaVersion?: number;
  id: string;
  runId: string;
  stageId?: string;
  stageName?: string;
  taskId: string;
  parentTaskId?: string;
  agentRunId?: string;
  reviewerName?: string;
  decision: 'approved' | 'needs_changes' | 'rejected';
  summary: string;
  feedback: string;
  issues: string[];
  requiredRework: string[];
  confidence?: number;
  source: 'agent' | 'human_override';
  overrideReason?: string;
  overriddenAgentRunId?: string;
  reviewedArtifactIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorControlIntent {
  schemaVersion?: number;
  runId: string;
  action: 'start' | 'pause' | 'resume' | 'cancel';
  createdAt: number;
}

export interface OrchestratorTemplatePayload {
  template: OrchestratorTemplate;
}

export interface OrchestratorPlanDraftPayload {
  planDraft: OrchestratorPlanDraft;
}

export interface OrchestratorRunPayload {
  run: OrchestratorRun;
}

export interface OrchestratorAgentRunPayload {
  agentRun: OrchestratorAgentRun;
}

export interface OrchestratorCoordinatorRunPayload {
  coordinatorRun: OrchestratorCoordinatorRun;
}

export interface OrchestratorCreateTemplateInput {
  name?: string;
}

export interface OrchestratorCreatePlanDraftInput {
  title?: string;
  goal: string;
  overview?: string;
  constraints?: string[];
  successCriteria?: string[];
  decompositionPrinciples?: string[];
  humanCheckpoints?: string[];
  reviewCheckpoints?: string[];
  reviewPolicy?: string;
  stages?: Array<{
    name: string;
    goal: string;
    deliverables?: string[];
    targetFolder?: string;
    outputFiles?: string[];
  }>;
  sourceSessionId?: string;
  sourceMessageId?: string;
}

export interface OrchestratorCreatePlanDraftFromSessionInput {
  sessionId: string;
  messageId?: string;
}

export interface OrchestratorUpdatePlanDraftInput {
  planDraftId: string;
  patch: Partial<Pick<OrchestratorPlanDraft, 'title' | 'goal' | 'overview' | 'constraints' | 'successCriteria' | 'decompositionPrinciples' | 'humanCheckpoints' | 'reviewCheckpoints' | 'reviewPolicy' | 'stages'>>;
}

export interface OrchestratorConfirmPlanDraftInput {
  planDraftId: string;
}

export interface OrchestratorGetPlanDraftInput {
  planDraftId: string;
}

export interface OrchestratorUpdateTemplateInput {
  templateId: string;
  patch: Partial<Pick<OrchestratorTemplate, 'name' | 'domain' | 'version' | 'description' | 'parameters' | 'stageRows'>>;
}

export interface OrchestratorDuplicateTemplateInput {
  templateId: string;
  name?: string;
}

export interface OrchestratorDeleteTemplateInput {
  templateId: string;
}

export interface OrchestratorMatchTemplatesInput {
  goal: string;
  limit?: number;
}

export interface OrchestratorGetRunInput {
  runId: string;
}

export interface OrchestratorWakeRunInput {
  runId: string;
  reason?: 'start' | 'resume' | 'task_completed' | 'task_skipped' | 'user_request' | 'system';
}

export interface OrchestratorPauseRunInput {
  runId: string;
}

export interface OrchestratorResumeRunInput {
  runId: string;
}

export interface OrchestratorCancelRunInput {
  runId: string;
}

export interface OrchestratorCompleteTaskInput {
  taskId: string;
}

export interface OrchestratorUpdateTaskInput {
  taskId: string;
  summary?: string;
}

export interface OrchestratorRetryTaskInput {
  taskId: string;
}

export interface OrchestratorSkipTaskInput {
  taskId: string;
}

export interface OrchestratorOverrideReviewInput {
  taskId: string;
  decision: 'approved' | 'needs_changes' | 'rejected';
  feedback?: string;
}
