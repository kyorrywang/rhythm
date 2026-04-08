import type { PluginContext } from '../../../src/plugin/sdk';
import { WORKFLOW_STORAGE_KEYS } from './constants';
import type { WorkflowDefinition, WorkflowRun, WorkflowSettings } from './types';

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  saveRunHistory: true,
  maxRunHistory: 20,
  openRunViewOnStart: true,
  continueOnError: false,
};

export async function listWorkflows(ctx: PluginContext) {
  return (
    await readJsonFile<WorkflowDefinition[]>(
      ctx,
      'definitions.json',
      WORKFLOW_STORAGE_KEYS.definitions,
      [],
    )
  );
}

export async function getWorkflow(ctx: PluginContext, workflowId: string) {
  const workflows = await listWorkflows(ctx);
  return workflows.find((workflow) => workflow.id === workflowId) || null;
}

export async function saveWorkflow(ctx: PluginContext, workflow: WorkflowDefinition) {
  const workflows = await listWorkflows(ctx);
  const next = workflows.some((item) => item.id === workflow.id)
    ? workflows.map((item) => (item.id === workflow.id ? workflow : item))
    : [workflow, ...workflows];
  await writeJsonFile(ctx, 'definitions.json', WORKFLOW_STORAGE_KEYS.definitions, next);
}

export async function deleteWorkflow(ctx: PluginContext, workflowId: string) {
  const workflows = await listWorkflows(ctx);
  await writeJsonFile(
    ctx,
    'definitions.json',
    WORKFLOW_STORAGE_KEYS.definitions,
    workflows.filter((workflow) => workflow.id !== workflowId),
  );
}

export async function listRuns(ctx: PluginContext) {
  return await readJsonFile<WorkflowRun[]>(ctx, 'runs.json', WORKFLOW_STORAGE_KEYS.runs, []);
}

export async function getRun(ctx: PluginContext, runId: string) {
  const runs = await listRuns(ctx);
  return runs.find((run) => run.id === runId) || null;
}

export async function saveRun(ctx: PluginContext, run: WorkflowRun) {
  const settings = await getWorkflowSettings(ctx);
  if (!settings.saveRunHistory) return;
  const runs = await listRuns(ctx);
  const next = runs.some((item) => item.id === run.id)
    ? runs.map((item) => (item.id === run.id ? run : item))
    : [run, ...runs];
  await writeJsonFile(ctx, 'runs.json', WORKFLOW_STORAGE_KEYS.runs, next.slice(0, settings.maxRunHistory));
}

export async function getWorkflowSettings(ctx: PluginContext) {
  const value = await readJsonFile<WorkflowSettings>(
    ctx,
    'settings.json',
    WORKFLOW_STORAGE_KEYS.settings,
    DEFAULT_WORKFLOW_SETTINGS,
  );
  return { ...DEFAULT_WORKFLOW_SETTINGS, ...value };
}

export async function saveWorkflowSettings(ctx: PluginContext, settings: WorkflowSettings) {
  await writeJsonFile(ctx, 'settings.json', WORKFLOW_STORAGE_KEYS.settings, settings);
}

async function readJsonFile<T>(ctx: PluginContext, path: string, legacyKey: string, fallback: T): Promise<T> {
  const text = await ctx.storage.files.readText(path);
  if (text) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  }
  const legacy = await ctx.storage.get<T>(legacyKey);
  if (legacy !== null) {
    await ctx.storage.files.writeText(path, JSON.stringify(legacy, null, 2));
    return legacy;
  }
  return fallback;
}

async function writeJsonFile<T>(ctx: PluginContext, path: string, legacyKey: string, value: T) {
  await Promise.all([
    ctx.storage.files.writeText(path, JSON.stringify(value, null, 2)),
    ctx.storage.set(legacyKey, value),
  ]);
}
