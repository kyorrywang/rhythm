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
const fileWriteLocks = new Map<string, Promise<unknown>>();
const runLocks = new Map<string, Promise<unknown>>();

export async function listPlanDrafts(ctx: PluginContext) {
  return readJsonArrayFile<OrchestratorPlanDraft>(ctx, PLAN_DRAFTS_PATH);
}

export async function getPlanDraft(ctx: PluginContext, planDraftId: string) {
  const planDrafts = await listPlanDrafts(ctx);
  return planDrafts.find((item) => item.id === planDraftId) || null;
}

export async function savePlanDraft(ctx: PluginContext, planDraft: OrchestratorPlanDraft) {
  await mutateJsonArrayFile(ctx, PLAN_DRAFTS_PATH, (planDrafts: OrchestratorPlanDraft[]) =>
    planDrafts.some((item) => item.id === planDraft.id)
      ? planDrafts.map((item) => (item.id === planDraft.id ? planDraft : item))
      : [planDraft, ...planDrafts]);
}

export async function updatePlanDraft(
  ctx: PluginContext,
  planDraftId: string,
  updater: (planDraft: OrchestratorPlanDraft) => OrchestratorPlanDraft,
) {
  let updated: OrchestratorPlanDraft | null = null;
  await mutateJsonArrayFile(ctx, PLAN_DRAFTS_PATH, (planDrafts: OrchestratorPlanDraft[]) =>
    planDrafts.map((planDraft) => {
      if (planDraft.id !== planDraftId) return planDraft;
      updated = updater(planDraft);
      return updated;
    }));
  return updated;
}

export async function listTemplates(ctx: PluginContext) {
  return readJsonArrayFile<OrchestratorTemplate>(ctx, TEMPLATES_PATH);
}

export async function getTemplate(ctx: PluginContext, templateId: string) {
  const templates = await listTemplates(ctx);
  return templates.find((item) => item.id === templateId) || null;
}

export async function saveTemplate(ctx: PluginContext, template: OrchestratorTemplate) {
  await mutateJsonArrayFile(ctx, TEMPLATES_PATH, (templates: OrchestratorTemplate[]) =>
    templates.some((item) => item.id === template.id)
      ? templates.map((item) => (item.id === template.id ? template : item))
      : [template, ...templates]);
}

export async function deleteTemplate(ctx: PluginContext, templateId: string) {
  await mutateJsonArrayFile(ctx, TEMPLATES_PATH, (templates: OrchestratorTemplate[]) =>
    templates.filter((item) => item.id !== templateId));
}

export async function updateTemplate(
  ctx: PluginContext,
  templateId: string,
  updater: (template: OrchestratorTemplate) => OrchestratorTemplate,
) {
  let updated: OrchestratorTemplate | null = null;
  await mutateJsonArrayFile(ctx, TEMPLATES_PATH, (templates: OrchestratorTemplate[]) =>
    templates.map((template) => {
      if (template.id !== templateId) return template;
      updated = updater(template);
      return updated;
    }));
  return updated;
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
  return mutateJsonFile(ctx, runFilePath(runId, 'run.json'), null as OrchestratorRun | null, (run) => {
    if (!run) return null;
    return updater(run);
  });
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
  await mutateJsonArrayFile(ctx, runFilePath(event.runId, 'events.json'), (events: OrchestratorRunEvent[]) => [event, ...events]);
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
  await mutateJsonArrayFile(ctx, runFilePath(task.runId, 'tasks.json'), (tasks: OrchestratorAgentTask[]) =>
    tasks.some((item) => item.id === task.id)
      ? tasks.map((item) => (item.id === task.id ? task : item))
      : [task, ...tasks]);
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
  await mutateJsonArrayFile(ctx, runFilePath(coordinatorRun.runId, 'orchestrator-agent-runs.json'), (agentRuns: OrchestratorCoordinatorRun[]) =>
    agentRuns.some((item) => item.id === coordinatorRun.id)
      ? agentRuns.map((item) => (item.id === coordinatorRun.id ? coordinatorRun : item))
      : [coordinatorRun, ...agentRuns]);
}

export async function updateCoordinatorRun(
  ctx: PluginContext,
  coordinatorRunId: string,
  updater: (coordinatorRun: OrchestratorCoordinatorRun) => OrchestratorCoordinatorRun,
) {
  return mutateRunScopedArrayItem(
    ctx,
    'orchestrator-agent-runs.json',
    (coordinatorRun): coordinatorRun is OrchestratorCoordinatorRun => coordinatorRun.id === coordinatorRunId,
    updater,
  );
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
  await mutateJsonArrayFile(ctx, runFilePath(agentRun.runId, 'agent-runs.json'), (agentRuns: OrchestratorAgentRun[]) =>
    agentRuns.some((item) => item.id === agentRun.id)
      ? agentRuns.map((item) => (item.id === agentRun.id ? agentRun : item))
      : [agentRun, ...agentRuns]);
}

export async function updateAgentRun(
  ctx: PluginContext,
  agentRunId: string,
  updater: (agentRun: OrchestratorAgentRun) => OrchestratorAgentRun,
) {
  return mutateRunScopedArrayItem(
    ctx,
    'agent-runs.json',
    (agentRun): agentRun is OrchestratorAgentRun => agentRun.id === agentRunId,
    updater,
  );
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
  await mutateJsonArrayFile(ctx, runFilePath(artifact.runId, 'artifacts.json'), (artifacts: OrchestratorArtifact[]) =>
    artifacts.some((item) => item.id === artifact.id)
      ? artifacts.map((item) => (item.id === artifact.id ? artifact : item))
      : [artifact, ...artifacts]);
}

export async function updateArtifact(
  ctx: PluginContext,
  artifactId: string,
  updater: (artifact: OrchestratorArtifact) => OrchestratorArtifact,
) {
  return mutateRunScopedArrayItem(
    ctx,
    'artifacts.json',
    (artifact): artifact is OrchestratorArtifact => artifact.id === artifactId,
    updater,
  );
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
  await mutateJsonArrayFile(ctx, runFilePath(reviewLog.runId, 'review-logs.json'), (logs: OrchestratorReviewLog[]) =>
    logs.some((item) => item.id === reviewLog.id)
      ? logs.map((item) => (item.id === reviewLog.id ? reviewLog : item))
      : [reviewLog, ...logs]);
}

export async function updateTask(
  ctx: PluginContext,
  taskId: string,
  updater: (task: OrchestratorAgentTask) => OrchestratorAgentTask,
) {
  return mutateRunScopedArrayItem(
    ctx,
    'tasks.json',
    (task): task is OrchestratorAgentTask => task.id === taskId,
    updater,
  );
}

export async function listControlIntents(ctx: PluginContext) {
  const runIds = await listRunIds(ctx);
  const batches = await Promise.all(
    runIds.map((runId) => readJsonFile<OrchestratorControlIntent[]>(ctx, runFilePath(runId, 'control-intents.json'), [])),
  );
  return batches.flat().sort((a, b) => b.createdAt - a.createdAt);
}

export async function appendControlIntent(ctx: PluginContext, intent: OrchestratorControlIntent) {
  await mutateJsonArrayFile(ctx, runFilePath(intent.runId, 'control-intents.json'), (intents: OrchestratorControlIntent[]) => [intent, ...intents]);
}

export function withRunLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
  const previous = runLocks.get(runId) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(operation);
  runLocks.set(runId, next);
  return next.finally(() => {
    if (runLocks.get(runId) === next) {
      runLocks.delete(runId);
    }
  });
}

async function listRunIds(ctx: PluginContext) {
  return readJsonArrayFile<string>(ctx, RUN_INDEX_PATH);
}

async function addRunIdToIndex(ctx: PluginContext, runId: string) {
  await mutateJsonArrayFile(ctx, RUN_INDEX_PATH, (runIds: string[]) => {
    if (runIds.includes(runId)) return runIds;
    return [runId, ...runIds];
  });
}

async function mutateRunScopedArrayItem<T>(
  ctx: PluginContext,
  fileName: string,
  matcher: (item: T) => boolean,
  updater: (item: T) => T,
) {
  const runIds = await listRunIds(ctx);
  for (const runId of runIds) {
    let updated: T | null = null;
    await mutateJsonArrayFile(ctx, runFilePath(runId, fileName), (items: T[]) =>
      items.map((item) => {
        if (!matcher(item)) return item;
        updated = updater(item);
        return updated;
      }));
    if (updated) return updated;
  }
  return null;
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
  await withFileLock(path, async () => {
    await ctx.storage.files.writeText(path, JSON.stringify(stampSchemaVersion(value), null, 2));
  });
}

async function mutateJsonFile<T>(
  ctx: PluginContext,
  path: string,
  fallback: T,
  updater: (current: T) => T,
) {
  return withFileLock(path, async () => {
    const current = await readJsonFile<T>(ctx, path, fallback);
    const next = updater(current);
    await ctx.storage.files.writeText(path, JSON.stringify(stampSchemaVersion(next), null, 2));
    return next;
  });
}

async function mutateJsonArrayFile<T>(ctx: PluginContext, path: string, updater: (items: T[]) => T[]) {
  return withFileLock(path, async () => {
    const current = await readJsonArrayFile<T>(ctx, path);
    const next = updater(current);
    await ctx.storage.files.writeText(path, JSON.stringify(stampSchemaVersion(next), null, 2));
    return next;
  });
}

function withFileLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = fileWriteLocks.get(path) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(operation);
  fileWriteLocks.set(path, next);
  return next.finally(() => {
    if (fileWriteLocks.get(path) === next) {
      fileWriteLocks.delete(path);
    }
  });
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
    revision: typeof draft.revision === 'number' ? draft.revision : 0,
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
    planRevision: typeof run.planRevision === 'number' ? run.planRevision : 1,
    confirmedPlan: {
      ...confirmedPlan,
      revision: typeof confirmedPlan.revision === 'number' ? confirmedPlan.revision : (typeof run.planRevision === 'number' ? run.planRevision : 1),
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
        providerId: run.executionContext.providerId || 'openai',
        model: run.executionContext.model || 'gpt-5.4',
        reasoning: run.executionContext.reasoning || 'medium',
        workspacePath: run.executionContext.workspacePath || '',
        toolPolicy: run.executionContext.toolPolicy && typeof run.executionContext.toolPolicy === 'object'
          ? {
            permissionMode: run.executionContext.toolPolicy.permissionMode === 'manual' ? 'manual' : 'full_auto',
          }
          : {
            permissionMode: 'full_auto',
          },
        capturedAt: run.executionContext.capturedAt || run.updatedAt || run.createdAt || Date.now(),
      }
      : undefined,
      pendingHumanAction: run.pendingHumanAction && typeof run.pendingHumanAction === 'object'
        ? {
          kind: run.pendingHumanAction.kind || 'checkpoint',
          summary: run.pendingHumanAction.summary || run.pendingHumanCheckpoint || 'Human action required before the run can continue.',
          taskId: run.pendingHumanAction.taskId,
          reviewLogId: run.pendingHumanAction.reviewLogId,
          requestedAt: run.pendingHumanAction.requestedAt || run.updatedAt || run.createdAt || Date.now(),
        }
        : run.pendingHumanCheckpoint
          ? {
            kind: 'checkpoint',
            summary: run.pendingHumanCheckpoint,
            requestedAt: run.updatedAt || run.createdAt || Date.now(),
          }
          : undefined,
      maintenanceLease: run.maintenanceLease && typeof run.maintenanceLease === 'object'
        ? {
          ownerId: run.maintenanceLease.ownerId || 'unknown',
          acquiredAt: run.maintenanceLease.acquiredAt || run.updatedAt || run.createdAt || Date.now(),
          heartbeatAt: run.maintenanceLease.heartbeatAt || run.updatedAt || run.createdAt || Date.now(),
          expiresAt: run.maintenanceLease.expiresAt || run.updatedAt || run.createdAt || Date.now(),
        }
        : undefined,
      metrics: run.metrics && typeof run.metrics === 'object'
        ? {
          totalTasks: typeof run.metrics.totalTasks === 'number' ? run.metrics.totalTasks : 0,
          completedTasks: typeof run.metrics.completedTasks === 'number' ? run.metrics.completedTasks : 0,
          acceptedArtifacts: typeof run.metrics.acceptedArtifacts === 'number' ? run.metrics.acceptedArtifacts : 0,
          reviewCount: typeof run.metrics.reviewCount === 'number' ? run.metrics.reviewCount : 0,
          lastComputedAt: run.metrics.lastComputedAt || run.updatedAt || run.createdAt || Date.now(),
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
