export const WORKFLOW_COMMANDS = {
  create: 'workflow.create',
  run: 'workflow.run',
  pause: 'workflow.pause',
  resume: 'workflow.resume',
  retry: 'workflow.retry',
  cancel: 'workflow.cancel',
  getStatus: 'workflow.getStatus',
  registerNodeType: 'workflow.registerNodeType',
} as const;

export const WORKFLOW_VIEWS = {
  panel: 'workflow.panel',
  editor: 'workflow.editor',
  run: 'workflow.run',
  nodeInspector: 'workflow.nodeInspector',
} as const;

export const WORKFLOW_SETTINGS_SECTION_ID = 'workflow.settings';

export const WORKFLOW_STORAGE_KEYS = {
  definitions: 'workflow.definitions',
  runs: 'workflow.runs',
  settings: 'workflow.settings',
} as const;

export const WORKFLOW_EVENTS = {
  changed: 'workflow.changed',
  runUpdated: 'workflow.runUpdated',
  ready: 'workflow.ready',
  nodeTypeRegister: 'workflow.nodeType.register',
  nodeTypesChanged: 'workflow.nodeTypesChanged',
} as const;
