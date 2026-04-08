import type { PluginContext, RunningCommand } from '../../../src/plugin/sdk';

export type WorkflowNodeType = 'manual' | 'shell' | 'command' | string;
export type WorkflowRunStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled';
export type WorkflowNodeRunStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'cancelled';

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
  command?: string;
  commandId?: string;
  inputJson?: string;
  [key: string]: string | undefined;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  startedAt: number;
  endedAt?: number;
  nodeRuns: Record<string, WorkflowNodeRun>;
}

export interface WorkflowNodeRun {
  nodeId: string;
  title: string;
  type: WorkflowNodeType;
  status: WorkflowNodeRunStatus;
  startedAt?: number;
  endedAt?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  logs: string[];
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

export interface WorkflowStatusInput {
  runId: string;
}

export interface WorkflowRuntimeHandle {
  cancel: () => Promise<boolean>;
  runningCommand?: RunningCommand<unknown>;
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
