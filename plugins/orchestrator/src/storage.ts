import type { PluginContext } from '../../../src/plugin/sdk';
import { ORCHESTRATOR_STORAGE_KEYS } from './constants';
import type {
  OrchestratorControlIntent,
  OrchestratorAgentTask,
  OrchestratorRun,
  OrchestratorRunEvent,
  OrchestratorTemplate,
} from './types';

export async function listTemplates(ctx: PluginContext) {
  return readJsonFile<OrchestratorTemplate[]>(
    ctx,
    'templates.json',
    ORCHESTRATOR_STORAGE_KEYS.templates,
    [],
  );
}

export async function getTemplate(ctx: PluginContext, templateId: string) {
  const templates = await listTemplates(ctx);
  return templates.find((item) => item.id === templateId) || null;
}

export async function saveTemplate(ctx: PluginContext, template: OrchestratorTemplate) {
  const templates = await listTemplates(ctx);
  const next = templates.some((item) => item.id === template.id)
    ? templates.map((item) => (item.id === template.id ? template : item))
    : [template, ...templates];
  await writeJsonFile(ctx, 'templates.json', ORCHESTRATOR_STORAGE_KEYS.templates, next);
}

export async function deleteTemplate(ctx: PluginContext, templateId: string) {
  const templates = await listTemplates(ctx);
  await writeJsonFile(
    ctx,
    'templates.json',
    ORCHESTRATOR_STORAGE_KEYS.templates,
    templates.filter((item) => item.id !== templateId),
  );
}

export async function updateTemplate(
  ctx: PluginContext,
  templateId: string,
  updater: (template: OrchestratorTemplate) => OrchestratorTemplate,
) {
  const template = await getTemplate(ctx, templateId);
  if (!template) return null;
  const next = updater(template);
  await saveTemplate(ctx, next);
  return next;
}

export async function listRuns(ctx: PluginContext) {
  return readJsonFile<OrchestratorRun[]>(
    ctx,
    'runs.json',
    ORCHESTRATOR_STORAGE_KEYS.runs,
    [],
  );
}

export async function getRun(ctx: PluginContext, runId: string) {
  const runs = await listRuns(ctx);
  return runs.find((item) => item.id === runId) || null;
}

export async function saveRun(ctx: PluginContext, run: OrchestratorRun) {
  const runs = await listRuns(ctx);
  const next = runs.some((item) => item.id === run.id)
    ? runs.map((item) => (item.id === run.id ? run : item))
    : [run, ...runs];
  await writeJsonFile(ctx, 'runs.json', ORCHESTRATOR_STORAGE_KEYS.runs, next);
}

export async function updateRun(ctx: PluginContext, runId: string, updater: (run: OrchestratorRun) => OrchestratorRun) {
  const run = await getRun(ctx, runId);
  if (!run) return null;
  const next = updater(run);
  await saveRun(ctx, next);
  return next;
}

export async function listRunEvents(ctx: PluginContext) {
  return readJsonFile<OrchestratorRunEvent[]>(
    ctx,
    'events.json',
    ORCHESTRATOR_STORAGE_KEYS.events,
    [],
  );
}

export async function listEventsForRun(ctx: PluginContext, runId: string) {
  const events = await listRunEvents(ctx);
  return events.filter((event) => event.runId === runId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function appendRunEvent(ctx: PluginContext, event: OrchestratorRunEvent) {
  const events = await listRunEvents(ctx);
  await writeJsonFile(ctx, 'events.json', ORCHESTRATOR_STORAGE_KEYS.events, [event, ...events]);
}

export async function listTasks(ctx: PluginContext) {
  return readJsonFile<OrchestratorAgentTask[]>(
    ctx,
    'tasks.json',
    ORCHESTRATOR_STORAGE_KEYS.tasks,
    [],
  );
}

export async function listTasksForRun(ctx: PluginContext, runId: string) {
  const tasks = await listTasks(ctx);
  return tasks.filter((task) => task.runId === runId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getTask(ctx: PluginContext, taskId: string) {
  const tasks = await listTasks(ctx);
  return tasks.find((task) => task.id === taskId) || null;
}

export async function saveTask(ctx: PluginContext, task: OrchestratorAgentTask) {
  const tasks = await listTasks(ctx);
  const next = tasks.some((item) => item.id === task.id)
    ? tasks.map((item) => (item.id === task.id ? task : item))
    : [task, ...tasks];
  await writeJsonFile(ctx, 'tasks.json', ORCHESTRATOR_STORAGE_KEYS.tasks, next);
}

export async function updateTask(
  ctx: PluginContext,
  taskId: string,
  updater: (task: OrchestratorAgentTask) => OrchestratorAgentTask,
) {
  const task = await getTask(ctx, taskId);
  if (!task) return null;
  const next = updater(task);
  await saveTask(ctx, next);
  return next;
}

export async function listControlIntents(ctx: PluginContext) {
  return readJsonFile<OrchestratorControlIntent[]>(
    ctx,
    'control-intents.json',
    ORCHESTRATOR_STORAGE_KEYS.controlIntents,
    [],
  );
}

export async function appendControlIntent(ctx: PluginContext, intent: OrchestratorControlIntent) {
  const intents = await listControlIntents(ctx);
  await writeJsonFile(ctx, 'control-intents.json', ORCHESTRATOR_STORAGE_KEYS.controlIntents, [intent, ...intents]);
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
