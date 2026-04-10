import type { PluginContext } from '../../../src/plugin/sdk';
import type {
  OrchestratorAgentRun,
  OrchestratorAgentTask,
  OrchestratorArtifact,
  OrchestratorCoordinatorRun,
  OrchestratorControlIntent,
  OrchestratorPlanDraft,
  OrchestratorProjectState,
  OrchestratorReviewPolicy,
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
const ORCHESTRATOR_SCHEMA_VERSION = 1;

export async function listPlanDrafts(ctx: PluginContext) {
  return readJsonArrayFile<OrchestratorPlanDraft>(ctx, PLAN_DRAFTS_PATH);
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
  return readJsonArrayFile<OrchestratorTemplate>(ctx, TEMPLATES_PATH);
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
  const events = await readJsonArrayFile<OrchestratorRunEvent>(ctx, runFilePath(runId, 'events.json'));
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
  const tasks = await readJsonArrayFile<OrchestratorAgentTask>(ctx, runFilePath(runId, 'tasks.json'));
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

export async function listCoordinatorRuns(ctx: PluginContext) {
  const runIds = await listRunIds(ctx);
  const batches = await Promise.all(runIds.map((runId) => listCoordinatorRunsForRun(ctx, runId)));
  return batches.flat().sort((a, b) => a.createdAt - b.createdAt);
}

export async function listCoordinatorRunsForRun(ctx: PluginContext, runId: string) {
  const agentRuns = await readJsonArrayFile<OrchestratorCoordinatorRun>(ctx, runFilePath(runId, 'orchestrator-agent-runs.json'));
  return agentRuns.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getCoordinatorRun(ctx: PluginContext, coordinatorRunId: string) {
  const agentRuns = await listCoordinatorRuns(ctx);
  return agentRuns.find((agentRun) => agentRun.id === coordinatorRunId) || null;
}

export async function saveCoordinatorRun(ctx: PluginContext, coordinatorRun: OrchestratorCoordinatorRun) {
  const agentRuns = await listCoordinatorRunsForRun(ctx, coordinatorRun.runId);
  const next = agentRuns.some((item) => item.id === coordinatorRun.id)
    ? agentRuns.map((item) => (item.id === coordinatorRun.id ? coordinatorRun : item))
    : [coordinatorRun, ...agentRuns];
  await writeJsonFile(ctx, runFilePath(coordinatorRun.runId, 'orchestrator-agent-runs.json'), next);
}

export async function updateCoordinatorRun(
  ctx: PluginContext,
  coordinatorRunId: string,
  updater: (coordinatorRun: OrchestratorCoordinatorRun) => OrchestratorCoordinatorRun,
) {
  const coordinatorRun = await getCoordinatorRun(ctx, coordinatorRunId);
  if (!coordinatorRun) return null;
  const next = updater(coordinatorRun);
  await saveCoordinatorRun(ctx, next);
  return next;
}

export async function listAgentRunsForRun(ctx: PluginContext, runId: string) {
  const agentRuns = await readJsonArrayFile<OrchestratorAgentRun>(ctx, runFilePath(runId, 'agent-runs.json'));
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
  const artifacts = await readJsonArrayFile<OrchestratorArtifact>(ctx, runFilePath(runId, 'artifacts.json'));
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

export async function getReviewPolicy(ctx: PluginContext, runId: string) {
  return readJsonFile<OrchestratorReviewPolicy | null>(ctx, runFilePath(runId, 'review-policy.json'), null);
}

export async function saveReviewPolicy(ctx: PluginContext, reviewPolicy: OrchestratorReviewPolicy & { runId: string }) {
  await writeJsonFile(ctx, runFilePath(reviewPolicy.runId, 'review-policy.json'), reviewPolicy);
}

export async function listReviewLogs(ctx: PluginContext) {
  const runIds = await listRunIds(ctx);
  const batches = await Promise.all(runIds.map((runId) => listReviewLogsForRun(ctx, runId)));
  return batches.flat().sort((a, b) => b.createdAt - a.createdAt);
}

export async function listReviewLogsForRun(ctx: PluginContext, runId: string) {
  const logs = await readJsonArrayFile<OrchestratorReviewLog>(ctx, runFilePath(runId, 'review-logs.json'));
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
  const intents = await readJsonArrayFile<OrchestratorControlIntent>(ctx, runFilePath(intent.runId, 'control-intents.json'));
  await writeJsonFile(ctx, runFilePath(intent.runId, 'control-intents.json'), [intent, ...intents]);
}

async function listRunIds(ctx: PluginContext) {
  return readJsonArrayFile<string>(ctx, RUN_INDEX_PATH);
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
    const parsed = JSON.parse(text) as unknown;
    return normalizePersistedValue(path, parsed, fallback);
  } catch (error) {
    console.error(`[orchestrator] Failed to parse persisted file: ${path}`, error);
    return fallback;
  }
}

async function readJsonArrayFile<T>(ctx: PluginContext, path: string): Promise<T[]> {
  const value = await readJsonFile<unknown>(ctx, path, []);
  return Array.isArray(value) ? value as T[] : [];
}

async function writeJsonFile<T>(ctx: PluginContext, path: string, value: T) {
  await ctx.storage.files.writeText(path, JSON.stringify(stampSchemaVersion(value), null, 2));
}

function normalizePersistedValue<T>(path: string, value: unknown, fallback: T): T {
  if (path === PLAN_DRAFTS_PATH) {
    if (!Array.isArray(value)) return fallback;
    return value.map((item) => normalizePlanDraft(item)).filter(Boolean) as T;
  }
  if (path === TEMPLATES_PATH) {
    if (!Array.isArray(value)) return fallback;
    return value.map((item) => normalizeTemplate(item)).filter(Boolean) as T;
  }
  if (path.endsWith('/run.json')) {
    return normalizeRun(value) as T;
  }
  if (path.endsWith('/review-policy.json')) {
    return normalizeReviewPolicy(value) as T;
  }
  if (path.endsWith('/project-state.json')) {
    return normalizeProjectState(value) as T;
  }
  if (path.endsWith('.json') && Array.isArray(value)) {
    return value.map((item) => stampSchemaVersion(item)).filter(Boolean) as T;
  }
  return stampSchemaVersion(value) as T;
}

function stampSchemaVersion<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stampSchemaVersion(item)) as T;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return {
    ...value,
    schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
  } as T;
}

function normalizeStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : fallback;
}

function normalizePlanDraft(value: unknown): OrchestratorPlanDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<OrchestratorPlanDraft>;
  if (!draft.id || !draft.goal) return null;
  return {
    ...draft,
    schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
    title: draft.title || draft.goal,
    overview: draft.overview || `围绕“${draft.goal}”推进项目，并逐步拆解执行任务。`,
    constraints: normalizeStringArray(draft.constraints),
    successCriteria: normalizeStringArray(draft.successCriteria, ['产出满足用户目标的高质量结果。']),
    decompositionPrinciples: normalizeStringArray(draft.decompositionPrinciples, ['先保持高层阶段清晰，再在运行中逐步细化为可执行任务。']),
    humanCheckpoints: normalizeStringArray(draft.humanCheckpoints, ['计划确认后再启动 run。']),
    reviewCheckpoints: normalizeStringArray(draft.reviewCheckpoints, ['每个主要阶段完成后进入审核。']),
    reviewPolicy: draft.reviewPolicy || '每个主要阶段完成后进入审核；不通过则返工。',
    stages: Array.isArray(draft.stages) ? draft.stages : [],
    status: draft.status || 'draft',
    createdAt: draft.createdAt || Date.now(),
    updatedAt: draft.updatedAt || draft.createdAt || Date.now(),
  } as OrchestratorPlanDraft;
}

function normalizeTemplate(value: unknown): OrchestratorTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const template = value as Partial<OrchestratorTemplate>;
  if (!template.id || !template.name) return null;
  return {
    ...template,
    schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
    domain: template.domain || 'general',
    version: template.version || '0.1.0',
    parameters: Array.isArray(template.parameters) ? template.parameters : [],
    stageRows: Array.isArray(template.stageRows) ? template.stageRows : [],
    createdAt: template.createdAt || Date.now(),
    updatedAt: template.updatedAt || template.createdAt || Date.now(),
  } as OrchestratorTemplate;
}

function normalizeRun(value: unknown): OrchestratorRun | null {
  if (!value || typeof value !== 'object') return null;
  const run = value as Partial<OrchestratorRun>;
  if (!run.id || !run.planId || !run.confirmedPlan || !run.goal) return null;
  const confirmedPlan = run.confirmedPlan;
  return {
    ...run,
    schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
    confirmedPlan: {
      ...confirmedPlan,
      constraints: normalizeStringArray(confirmedPlan.constraints),
      successCriteria: normalizeStringArray(confirmedPlan.successCriteria),
      decompositionPrinciples: normalizeStringArray(confirmedPlan.decompositionPrinciples, ['先保持高层阶段清晰，再在运行中逐步细化为可执行任务。']),
      humanCheckpoints: normalizeStringArray(confirmedPlan.humanCheckpoints, ['计划确认后再启动 run。']),
      reviewCheckpoints: normalizeStringArray(confirmedPlan.reviewCheckpoints, ['每个主要阶段完成后进入审核。']),
      reviewPolicy: confirmedPlan.reviewPolicy || '每个主要阶段完成后进入审核；不通过则返工。',
      stages: Array.isArray(confirmedPlan.stages) ? confirmedPlan.stages : [],
    },
    executionContext: run.executionContext && typeof run.executionContext === 'object'
      ? {
        ...run.executionContext,
        workspacePath: run.executionContext.workspacePath || '',
        capturedAt: run.executionContext.capturedAt || run.updatedAt || run.createdAt || Date.now(),
      }
      : undefined,
      failureState: run.failureState && typeof run.failureState === 'object'
        ? {
          ...run.failureState,
          summary: run.failureState.summary || 'Run failed.',
          retryable: Boolean(run.failureState.retryable),
          requiresHuman: Boolean(run.failureState.requiresHuman),
          recommendedAction: run.failureState.recommendedAction || 'Inspect the failure and decide whether to resume the run.',
          autoRetryAt: typeof run.failureState.autoRetryAt === 'number' ? run.failureState.autoRetryAt : undefined,
          firstOccurredAt: run.failureState.firstOccurredAt || run.updatedAt || run.createdAt || Date.now(),
          lastOccurredAt: run.failureState.lastOccurredAt || run.updatedAt || run.createdAt || Date.now(),
          retryCount: typeof run.failureState.retryCount === 'number' ? run.failureState.retryCount : 0,
        }
      : undefined,
    activeTaskCount: typeof run.activeTaskCount === 'number' ? run.activeTaskCount : 0,
    maxConcurrentTasks: typeof run.maxConcurrentTasks === 'number' ? run.maxConcurrentTasks : 2,
    status: run.status || 'pending',
    createdAt: run.createdAt || Date.now(),
    updatedAt: run.updatedAt || run.createdAt || Date.now(),
  } as OrchestratorRun;
}

function normalizeReviewPolicy(value: unknown): OrchestratorReviewPolicy | null {
  if (!value || typeof value !== 'object') return null;
  const policy = value as Partial<OrchestratorReviewPolicy>;
  return {
    ...policy,
    schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
    defaultRequiresReview: policy.defaultRequiresReview ?? true,
    allowHumanOverride: policy.allowHumanOverride ?? true,
    stagePolicies: Array.isArray(policy.stagePolicies) ? policy.stagePolicies : [],
    createdAt: policy.createdAt || Date.now(),
    updatedAt: policy.updatedAt || policy.createdAt || Date.now(),
  } as OrchestratorReviewPolicy;
}

function normalizeProjectState(value: unknown): OrchestratorProjectState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<OrchestratorProjectState>;
  if (!state.runId) return null;
  return {
    ...state,
    schemaVersion: ORCHESTRATOR_SCHEMA_VERSION,
    entries: Array.isArray(state.entries) ? state.entries : [],
    structureSummary: normalizeStringArray(state.structureSummary),
    dependencySummary: normalizeStringArray(state.dependencySummary),
    updatedAt: state.updatedAt || Date.now(),
  } as OrchestratorProjectState;
}
