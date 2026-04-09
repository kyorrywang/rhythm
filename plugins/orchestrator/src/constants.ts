export const ORCHESTRATOR_VIEWS = {
  panel: 'orchestrator.panel',
  template: 'orchestrator.template',
  run: 'orchestrator.run',
} as const;

export const ORCHESTRATOR_COMMANDS = {
  createTemplate: 'orchestrator.createTemplate',
  createSampleNovelTemplate: 'orchestrator.createSampleNovelTemplate',
  createSampleSoftwareTemplate: 'orchestrator.createSampleSoftwareTemplate',
  updateTemplate: 'orchestrator.updateTemplate',
  duplicateTemplate: 'orchestrator.duplicateTemplate',
  deleteTemplate: 'orchestrator.deleteTemplate',
  matchTemplates: 'orchestrator.matchTemplates',
  createRun: 'orchestrator.createRun',
  wakeRun: 'orchestrator.wakeRun',
  pauseRun: 'orchestrator.pauseRun',
  resumeRun: 'orchestrator.resumeRun',
  cancelRun: 'orchestrator.cancelRun',
  completeTask: 'orchestrator.completeTask',
  getRun: 'orchestrator.getRun',
  listTemplates: 'orchestrator.listTemplates',
  listRuns: 'orchestrator.listRuns',
  listTasks: 'orchestrator.listTasks',
} as const;

export const ORCHESTRATOR_EVENTS = {
  templatesChanged: 'orchestrator.templates.changed',
  runsChanged: 'orchestrator.runs.changed',
} as const;

export const ORCHESTRATOR_STORAGE_KEYS = {
  templates: 'orchestrator.templates',
  runs: 'orchestrator.runs',
  events: 'orchestrator.events',
  tasks: 'orchestrator.tasks',
  controlIntents: 'orchestrator.controlIntents',
} as const;
