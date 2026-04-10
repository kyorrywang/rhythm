export type OrchestratorRunStatus =
  | 'pending'
  | 'running'
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
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type OrchestratorTaskNodeType = 'container' | 'work' | 'review';
export type OrchestratorTaskSource = 'plan_seed' | 'orchestrator_split' | 'rework';

export type OrchestratorExecutionMode = 'direct' | 'workflow';

export interface OrchestratorTemplate {
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
}

export interface OrchestratorPlanDraft {
  id: string;
  title: string;
  goal: string;
  sourceSessionId?: string;
  sourceMessageId?: string;
  status: 'draft' | 'confirmed';
  overview: string;
  constraints: string[];
  successCriteria: string[];
  reviewPolicy: string;
  stages: OrchestratorPlanStage[];
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
  runId?: string;
}

export interface OrchestratorConfirmedPlan {
  id: string;
  title: string;
  goal: string;
  overview: string;
  constraints: string[];
  successCriteria: string[];
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
  id: string;
  planId: string;
  planTitle: string;
  confirmedPlan: OrchestratorConfirmedPlan;
  goal: string;
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
  orchestrationInput?: OrchestrationInputSnapshot;
  orchestrationPrompt?: string;
  orchestrationDecision?: OrchestrationDecisionRecord;
  pauseRequestedAt?: number;
  pausedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorRunEvent {
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
  id: string;
  runId: string;
  nodeType: OrchestratorTaskNodeType;
  kind?: 'work' | 'review';
  parentTaskId?: string;
  rootTaskId: string;
  depth: number;
  order: number;
  source: OrchestratorTaskSource;
  latestAgentRunId?: string;
  attemptCount: number;
  sessionId?: string;
  stageId?: string;
  stageName?: string;
  agentId?: string;
  agentName?: string;
  title: string;
  status: OrchestratorTaskStatus;
  summary?: string;
  failurePolicy?: OrchestratorAgent['failurePolicy'];
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorAgentRun {
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
  startedAt?: number;
  completedAt?: number;
  lastEventAt?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorArtifact {
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
  status: 'draft' | 'accepted' | 'superseded';
  version: number;
  kind: 'summary' | 'draft' | 'report' | 'notes';
  format: 'text' | 'markdown' | 'json';
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
  stageId?: string;
  stageName?: string;
  summary: string;
  updatedAt: number;
}

export interface OrchestratorProjectState {
  runId: string;
  entries: OrchestratorProjectStateEntry[];
  updatedAt: number;
}

export interface WorkAgentInputSnapshot {
  runGoal: string;
  planTitle: string;
  planOverview: string;
  stageId?: string;
  stageName?: string;
  stageGoal?: string;
  deliverables: string[];
  constraints: string[];
  successCriteria: string[];
  reviewPolicy: string;
  taskSummary?: string;
  coordinatorBrief?: string;
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
  runGoal: string;
  planTitle: string;
  planOverview: string;
  stageId?: string;
  stageName?: string;
  stageGoal?: string;
  deliverables: string[];
  constraints: string[];
  successCriteria: string[];
  reviewPolicy: string;
  taskSummary?: string;
  coordinatorBrief?: string;
  reviewedTaskId?: string;
  reviewedArtifactIds: string[];
  reviewedArtifactSummaries: string[];
  recentReviewSummaries: string[];
  projectStateSummary: string[];
}

export interface ReviewAgentOutputSnapshot {
  decision: 'approved' | 'needs_changes' | 'rejected';
  summary: string;
  feedback: string;
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
  activeTaskCount: number;
  availableSlots: number;
}

export interface OrchestrationDispatchDecision {
  parentTaskId: string;
  stageId: string;
  stageName: string;
  stageGoal: string;
  deliverables: string[];
  kind: 'work' | 'review';
  agentId: string;
  agentName: string;
  goal: string;
}

export interface OrchestrationDecision {
  status: 'dispatch' | 'wait' | 'throttle' | 'complete';
  summary: string;
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
  wakeReason?: OrchestratorWakeRunInput['reason'];
  currentStageName?: string;
  activeTaskCount: number;
  availableSlots: number;
  readyTaskTitles: string[];
  blockedTaskTitles: string[];
  waitingReviewTaskTitles: string[];
  latestReviewSummaries: string[];
  projectStateSummary: string[];
}

export interface OrchestrationDecisionRecord {
  status: OrchestrationDecision['status'];
  summary: string;
  dispatchCount: number;
  currentStageName?: string;
  currentAgentName?: string;
  dispatchTitles: string[];
  createdAt: number;
}

export interface OrchestratorReviewLog {
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
  source: 'agent' | 'human_override';
  overrideReason?: string;
  overriddenAgentRunId?: string;
  reviewedArtifactIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorControlIntent {
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

export interface OrchestratorCreateTemplateInput {
  name?: string;
}

export interface OrchestratorCreatePlanDraftInput {
  title?: string;
  goal: string;
  overview?: string;
  constraints?: string[];
  successCriteria?: string[];
  reviewPolicy?: string;
  stages?: Array<{
    name: string;
    goal: string;
    deliverables?: string[];
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
  patch: Partial<Pick<OrchestratorPlanDraft, 'title' | 'goal' | 'overview' | 'constraints' | 'successCriteria' | 'reviewPolicy' | 'stages'>>;
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
