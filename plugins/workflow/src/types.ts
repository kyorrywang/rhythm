import type { PluginContext, RunningCommand } from '../../../src/plugin/sdk';

export type WorkflowNodeType = 'start' | 'llm' | 'if' | 'loop' | 'set' | 'end' | 'shell' | 'command' | string;
export type WorkflowRunStatus = 'queued' | 'running' | 'paused' | 'success' | 'error' | 'cancelled';
export type WorkflowNodeRunStatus = 'pending' | 'running' | 'paused' | 'success' | 'error' | 'skipped' | 'cancelled';

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  title: string;
  config: WorkflowNodeConfig;
  position: { x: number; y: number };
}

export interface WorkflowNodeConfig {
  prompt?: string;
  systemPrompt?: string;
  providerId?: string;
  model?: string;
  timeoutSecs?: string;
  outputMode?: 'text' | 'json' | string;
  outputSchema?: string;
  leftValue?: string;
  operator?: 'equals' | 'not_equals' | 'contains' | 'exists' | 'greater_than' | string;
  rightValue?: string;
  mode?: 'for_each' | 'repeat_until' | string;
  itemsTemplate?: string;
  maxIterations?: string;
  command?: string;
  commandId?: string;
  inputJson?: string;
  [key: string]: unknown;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  branch?: 'true' | 'false' | 'default' | string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  startedAt: number;
  endedAt?: number;
  currentNodeId?: string;
  resumeFromNodeId?: string;
  checkpointVersion: number;
  variables: Record<string, unknown>;
  nodeRuns: Record<string, WorkflowNodeRun>;
  executionStack?: WorkflowExecutionFrame[];
}

export interface WorkflowNodeRun {
  nodeId: string;
  title: string;
  type: WorkflowNodeType;
  status: WorkflowNodeRunStatus;
  attempt: number;
  startedAt?: number;
  endedAt?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  logs: string[];
  checkpoint?: WorkflowNodeCheckpoint;
}

export interface WorkflowSettings {
  saveRunHistory: boolean;
  maxRunHistory: number;
  openRunViewOnStart: boolean;
  continueOnError: boolean;
}

export interface WorkflowRunPayload {
  workflow: WorkflowDefinition;
  run: WorkflowRun;
}

export interface WorkflowEditorPayload {
  workflow: WorkflowDefinition;
}

export interface WorkflowExportEnvelope {
  schema: 'rhythm.workflow.v1';
  exportedAt: number;
  workflow: WorkflowDefinition;
}

export interface WorkflowNodeInspectorPayload {
  workflow: WorkflowDefinition;
  run?: WorkflowRun;
  node: WorkflowNode;
  nodeRun?: WorkflowNodeRun;
}

export interface WorkflowCreateInput {
  name?: string;
}

export interface WorkflowRunInput {
  workflowId: string;
}

export interface WorkflowCancelInput {
  runId: string;
}

export interface WorkflowPauseInput {
  runId: string;
}

export interface WorkflowResumeInput {
  runId: string;
}

export interface WorkflowRetryInput {
  runId: string;
}

export interface WorkflowStatusInput {
  runId: string;
}

export interface WorkflowRuntimeHandle {
  workflow: WorkflowDefinition;
  run: WorkflowRun;
  pauseRequested: boolean;
  cancelRequested: boolean;
  cancel: () => Promise<boolean>;
  requestPause: () => Promise<boolean>;
  runningCommand?: RunningCommand<unknown>;
}

export interface WorkflowNodeCheckpoint {
  savedAt: number;
  kind: 'node_boundary' | 'loop_iteration' | 'wait_state';
  data: Record<string, unknown>;
}

export interface WorkflowExecutionFrame {
  type: 'loop';
  nodeId: string;
  mode?: 'for_each' | 'repeat_until' | string;
  iteration: number;
  maxIterations: number;
  items?: unknown[];
  cursor?: number;
}

export type WorkflowPluginContext = PluginContext;

export interface WorkflowNodeTypeDefinition {
  id: string;
  title: string;
  description?: string;
  sourcePlugin?: string;
  commandId?: string;
  defaultConfig?: WorkflowNodeConfig;
}

export interface WorkflowNodeExecutionContext {
  ctx: PluginContext;
  workflow: WorkflowDefinition;
  run: WorkflowRun;
  node: WorkflowNode;
  nodeRun: WorkflowNodeRun;
  signal: {
    isCancelled: () => boolean;
    setRunningCommand: (runningCommand?: RunningCommand<unknown>) => void;
  };
  update: () => Promise<void>;
}

export interface WorkflowNodeExecutorDefinition extends WorkflowNodeTypeDefinition {
  run: (context: WorkflowNodeExecutionContext) => Promise<unknown>;
}
