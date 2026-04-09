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
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type OrchestratorExecutionMode = 'direct' | 'workflow';

export interface OrchestratorTemplate {
  id: string;
  name: string;
  domain: string;
  version: string;
  description?: string;
  stageRows: OrchestratorStageRow[];
  createdAt: number;
  updatedAt: number;
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
  templateId: string;
  templateName: string;
  goal: string;
  status: OrchestratorRunStatus;
  source: 'chat' | 'workbench' | 'system';
  currentStageId?: string;
  currentStageName?: string;
  currentAgentId?: string;
  currentAgentName?: string;
  activeTaskCount: number;
  lastWakeAt?: number;
  lastDecisionAt?: number;
  lastDecisionSummary?: string;
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
  stageId?: string;
  stageName?: string;
  agentId?: string;
  agentName?: string;
  title: string;
  status: OrchestratorTaskStatus;
  summary?: string;
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

export interface OrchestratorRunPayload {
  run: OrchestratorRun;
}

export interface OrchestratorCreateTemplateInput {
  name?: string;
}

export interface OrchestratorUpdateTemplateInput {
  templateId: string;
  patch: Partial<Pick<OrchestratorTemplate, 'name' | 'domain' | 'version' | 'description' | 'stageRows'>>;
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

export interface OrchestratorCreateRunInput {
  templateId: string;
  goal: string;
  source?: 'chat' | 'workbench' | 'system';
}

export interface OrchestratorGetRunInput {
  runId: string;
}

export interface OrchestratorWakeRunInput {
  runId: string;
  reason?: 'start' | 'resume' | 'task_completed' | 'user_request' | 'system';
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
