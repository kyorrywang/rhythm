export const ORCHESTRATOR_VIEWS = {
  panel: 'orchestrator.panel',
  template: 'orchestrator.template',
  planDraft: 'orchestrator.plan-draft',
  run: 'orchestrator.run',
  agentRun: 'orchestrator.agent-run',
} as const;

export const ORCHESTRATOR_COMMANDS = {
  createPlanDraft: 'orchestrator.createPlanDraft',
  createPlanDraftFromSession: 'orchestrator.createPlanDraftFromSession',
  updatePlanDraft: 'orchestrator.updatePlanDraft',
  confirmPlanDraft: 'orchestrator.confirmPlanDraft',
  getPlanDraft: 'orchestrator.getPlanDraft',
  listPlanDrafts: 'orchestrator.listPlanDrafts',
  createTemplate: 'orchestrator.createTemplate',
  createSampleNovelTemplate: 'orchestrator.createSampleNovelTemplate',
  createSampleSoftwareTemplate: 'orchestrator.createSampleSoftwareTemplate',
  updateTemplate: 'orchestrator.updateTemplate',
  duplicateTemplate: 'orchestrator.duplicateTemplate',
  deleteTemplate: 'orchestrator.deleteTemplate',
  matchTemplates: 'orchestrator.matchTemplates',
  wakeRun: 'orchestrator.wakeRun',
  pauseRun: 'orchestrator.pauseRun',
  resumeRun: 'orchestrator.resumeRun',
  cancelRun: 'orchestrator.cancelRun',
  completeTask: 'orchestrator.completeTask',
  overrideReview: 'orchestrator.overrideReview',
  updateTask: 'orchestrator.updateTask',
  retryTask: 'orchestrator.retryTask',
  skipTask: 'orchestrator.skipTask',
  getRun: 'orchestrator.getRun',
  listTemplates: 'orchestrator.listTemplates',
  listRuns: 'orchestrator.listRuns',
  listTasks: 'orchestrator.listTasks',
} as const;

export const ORCHESTRATOR_EVENTS = {
  planDraftsChanged: 'orchestrator.planDrafts.changed',
  templatesChanged: 'orchestrator.templates.changed',
  runsChanged: 'orchestrator.runs.changed',
} as const;

export const ORCHESTRATOR_STORAGE_KEYS = {
  planDrafts: 'orchestrator.planDrafts',
  templates: 'orchestrator.templates',
  runs: 'orchestrator.runs',
  events: 'orchestrator.events',
  tasks: 'orchestrator.tasks',
  agentRuns: 'orchestrator.agentRuns',
  artifacts: 'orchestrator.artifacts',
  projectState: 'orchestrator.projectState',
  reviewLogs: 'orchestrator.reviewLogs',
  controlIntents: 'orchestrator.controlIntents',
} as const;
