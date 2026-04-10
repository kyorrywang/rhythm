import type { PluginContext } from '../../../src/plugin/sdk';
import type {
  OrchestratorAgentRun,
  OrchestratorAgentTask,
  OrchestratorArtifact,
  OrchestratorControlIntent,
  OrchestratorPlanDraft,
  OrchestratorProjectState,
  OrchestratorReviewLog,
  OrchestratorRun,
  OrchestratorRunEvent,
  OrchestratorTemplate,
} from './types';

const ROOT = 'data';
const RUNS_ROOT = `${ROOT}/runs`;
const RUN_INDEX_PATH = `${RUNS_ROOT}/index.json`;
const PLAN_DRAFTS_PATH = `${ROOT}/plan-drafts.json`;
const TEMPLATES_PATH = `${ROOT}/templates.json`;

export async function listPlanDrafts(ctx: PluginContext) {
  return readJsonFile<OrchestratorPlanDraft[]>(ctx, PLAN_DRAFTS_PATH, []);
}

export async function getPlanDraft(ctx: PluginContext, planDraftId: string) {
  const planDrafts = await listPlanDrafts(ctx);
  return planDrafts.find((item) => item.id === planDraftId) || null;
}

export async function savePlanDraft(ctx: PluginContext, planDraft: OrchestratorPlanDraft) {
  const planDrafts = await listPlanDrafts(ctx);
  const next = planDrafts.some((item) => item.id === planDraft.id)
    ? planDrafts.map((item) => (item.id === planDraft.id ? planDraft : item))
    : [planDraft, ...planDrafts];
  await writeJsonFile(ctx, PLAN_DRAFTS_PATH, next);
}

export async function updatePlanDraft(
  ctx: PluginContext,
  planDraftId: string,
  updater: (planDraft: OrchestratorPlanDraft) => OrchestratorPlanDraft,
) {
  const planDraft = await getPlanDraft(ctx, planDraftId);
  if (!planDraft) return null;
  const next = updater(planDraft);
  await savePlanDraft(ctx, next);
  return next;
}

export async function listTemplates(ctx: PluginContext) {
  return readJsonFile<OrchestratorTemplate[]>(ctx, TEMPLATES_PATH, []);
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
  await writeJsonFile(ctx, TEMPLATES_PATH, next);
}

export async function deleteTemplate(ctx: PluginContext, templateId: string) {
  const templates = await listTemplates(ctx);
  await writeJsonFile(
    ctx,
    TEMPLATES_PATH,
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
  const runIds = await listRunIds(ctx);
  const runs = await Promise.all(runIds.map((runId) => getRun(ctx, runId)));
  return runs.filter((run): run is OrchestratorRun => Boolean(run)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRun(ctx: PluginContext, runId: string) {
  return readJsonFile<OrchestratorRun | null>(ctx, runFilePath(runId, 'run.json'), null);
}

export async function saveRun(ctx: PluginContext, run: OrchestratorRun) {
  await Promise.all([
    writeJsonFile(ctx, runFilePath(run.id, 'run.json'), run),
    addRunIdToIndex(ctx, run.id),
  ]);
}

export async function updateRun(ctx: PluginContext, runId: string, updater: (run: OrchestratorRun) => OrchestratorRun) {
  const run = await getRun(ctx, runId);
  if (!run) return null;
  const next = updater(run);
  await saveRun(ctx, next);
  return next;
}

export async function listRunEvents(ctx: PluginContext) {
  const runIds = await listRunIds(ctx);
  const batches = await Promise.all(runIds.map((runId) => listEventsForRun(ctx, runId)));
  return batches.flat().sort((a, b) => a.createdAt - b.createdAt);
}

export async function listEventsForRun(ctx: PluginContext, runId: string) {
  const events = await readJsonFile<OrchestratorRunEvent[]>(ctx, runFilePath(runId, 'events.json'), []);
  return events.sort((a, b) => a.createdAt - b.createdAt);
}

export async function appendRunEvent(ctx: PluginContext, event: OrchestratorRunEvent) {
  const events = await listEventsForRun(ctx, event.runId);
  await writeJsonFile(ctx, runFilePath(event.runId, 'events.json'), [event, ...events]);
}

export async function listTasks(ctx: PluginContext) {
  const runIds = await listRunIds(ctx);
  const batches = await Promise.all(runIds.map((runId) => listTasksForRun(ctx, runId)));
  return batches.flat().sort((a, b) => a.depth - b.depth || a.order - b.order || a.createdAt - b.createdAt);
}

export async function listTasksForRun(ctx: PluginContext, runId: string) {
  const tasks = await readJsonFile<OrchestratorAgentTask[]>(ctx, runFilePath(runId, 'tasks.json'), []);
  return tasks.sort((a, b) => a.depth - b.depth || a.order - b.order || a.createdAt - b.createdAt);
}

export async function getTask(ctx: PluginContext, taskId: string) {
  const tasks = await listTasks(ctx);
  return tasks.find((task) => task.id === taskId) || null;
}

export async function saveTask(ctx: PluginContext, task: OrchestratorAgentTask) {
  const tasks = await listTasksForRun(ctx, task.runId);
  const next = tasks.some((item) => item.id === task.id)
    ? tasks.map((item) => (item.id === task.id ? task : item))
    : [task, ...tasks];
  await writeJsonFile(ctx, runFilePath(task.runId, 'tasks.json'), next);
}

export async function listAgentRuns(ctx: PluginContext) {
  const runIds = await listRunIds(ctx);
  const batches = await Promise.all(runIds.map((runId) => listAgentRunsForRun(ctx, runId)));
  return batches.flat().sort((a, b) => a.createdAt - b.createdAt);
}

export async function listAgentRunsForRun(ctx: PluginContext, runId: string) {
  const agentRuns = await readJsonFile<OrchestratorAgentRun[]>(ctx, runFilePath(runId, 'agent-runs.json'), []);
  return agentRuns.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getAgentRun(ctx: PluginContext, agentRunId: string) {
  const agentRuns = await listAgentRuns(ctx);
  return agentRuns.find((agentRun) => agentRun.id === agentRunId) || null;
}

export async function getAgentRunByTaskId(ctx: PluginContext, taskId: string) {
  const agentRuns = await listAgentRuns(ctx);
  return agentRuns
    .filter((agentRun) => agentRun.taskId === taskId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}

export async function saveAgentRun(ctx: PluginContext, agentRun: OrchestratorAgentRun) {
  const agentRuns = await listAgentRunsForRun(ctx, agentRun.runId);
  const next = agentRuns.some((item) => item.id === agentRun.id)
    ? agentRuns.map((item) => (item.id === agentRun.id ? agentRun : item))
    : [agentRun, ...agentRuns];
  await writeJsonFile(ctx, runFilePath(agentRun.runId, 'agent-runs.json'), next);
}

export async function updateAgentRun(
  ctx: PluginContext,
  agentRunId: string,
  updater: (agentRun: OrchestratorAgentRun) => OrchestratorAgentRun,
) {
  const agentRun = await getAgentRun(ctx, agentRunId);
  if (!agentRun) return null;
  const next = updater(agentRun);
  await saveAgentRun(ctx, next);
  return next;
}

export async function listArtifacts(ctx: PluginContext) {
  const runIds = await listRunIds(ctx);
  const batches = await Promise.all(runIds.map((runId) => listArtifactsForRun(ctx, runId)));
  return batches.flat().sort((a, b) => a.createdAt - b.createdAt);
}

export async function listArtifactsForRun(ctx: PluginContext, runId: string) {
  const artifacts = await readJsonFile<OrchestratorArtifact[]>(ctx, runFilePath(runId, 'artifacts.json'), []);
  return artifacts.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveArtifact(ctx: PluginContext, artifact: OrchestratorArtifact) {
  const artifacts = await listArtifactsForRun(ctx, artifact.runId);
  const next = artifacts.some((item) => item.id === artifact.id)
    ? artifacts.map((item) => (item.id === artifact.id ? artifact : item))
    : [artifact, ...artifacts];
  await writeJsonFile(ctx, runFilePath(artifact.runId, 'artifacts.json'), next);
}

export async function updateArtifact(
  ctx: PluginContext,
  artifactId: string,
  updater: (artifact: OrchestratorArtifact) => OrchestratorArtifact,
) {
  const artifacts = await listArtifacts(ctx);
  const artifact = artifacts.find((item) => item.id === artifactId);
  if (!artifact) return null;
  const next = updater(artifact);
  await saveArtifact(ctx, next);
  return next;
}

export async function getProjectState(ctx: PluginContext, runId: string) {
  return readJsonFile<OrchestratorProjectState | null>(ctx, runFilePath(runId, 'project-state.json'), null);
}

export async function saveProjectState(ctx: PluginContext, projectState: OrchestratorProjectState) {
  await writeJsonFile(ctx, runFilePath(projectState.runId, 'project-state.json'), projectState);
}

export async function listReviewLogs(ctx: PluginContext) {
  const runIds = await listRunIds(ctx);
  const batches = await Promise.all(runIds.map((runId) => listReviewLogsForRun(ctx, runId)));
  return batches.flat().sort((a, b) => b.createdAt - a.createdAt);
}

export async function listReviewLogsForRun(ctx: PluginContext, runId: string) {
  const logs = await readJsonFile<OrchestratorReviewLog[]>(ctx, runFilePath(runId, 'review-logs.json'), []);
  return logs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveReviewLog(ctx: PluginContext, reviewLog: OrchestratorReviewLog) {
  const logs = await listReviewLogsForRun(ctx, reviewLog.runId);
  const next = logs.some((item) => item.id === reviewLog.id)
    ? logs.map((item) => (item.id === reviewLog.id ? reviewLog : item))
    : [reviewLog, ...logs];
  await writeJsonFile(ctx, runFilePath(reviewLog.runId, 'review-logs.json'), next);
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
  const runIds = await listRunIds(ctx);
  const batches = await Promise.all(
    runIds.map((runId) => readJsonFile<OrchestratorControlIntent[]>(ctx, runFilePath(runId, 'control-intents.json'), [])),
  );
  return batches.flat().sort((a, b) => b.createdAt - a.createdAt);
}

export async function appendControlIntent(ctx: PluginContext, intent: OrchestratorControlIntent) {
  const intents = await readJsonFile<OrchestratorControlIntent[]>(ctx, runFilePath(intent.runId, 'control-intents.json'), []);
  await writeJsonFile(ctx, runFilePath(intent.runId, 'control-intents.json'), [intent, ...intents]);
}

async function listRunIds(ctx: PluginContext) {
  return readJsonFile<string[]>(ctx, RUN_INDEX_PATH, []);
}

async function addRunIdToIndex(ctx: PluginContext, runId: string) {
  const runIds = await listRunIds(ctx);
  if (runIds.includes(runId)) return;
  await writeJsonFile(ctx, RUN_INDEX_PATH, [runId, ...runIds]);
}

function runFilePath(runId: string, fileName: string) {
  return `${RUNS_ROOT}/${runId}/${fileName}`;
}

async function readJsonFile<T>(ctx: PluginContext, path: string, fallback: T): Promise<T> {
  const text = await ctx.storage.files.readText(path);
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile<T>(ctx: PluginContext, path: string, value: T) {
  await ctx.storage.files.writeText(path, JSON.stringify(value, null, 2));
}
