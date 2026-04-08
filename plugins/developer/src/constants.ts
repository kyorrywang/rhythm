export const DEVELOPER_COMMANDS = {
  runCommand: 'developer.runCommand',
  gitStatus: 'developer.gitStatus',
  gitDiff: 'developer.gitDiff',
  gitDiffFile: 'developer.gitDiffFile',
  stageFile: 'developer.stageFile',
  unstageFile: 'developer.unstageFile',
  stagedDiff: 'developer.stagedDiff',
  commit: 'developer.commit',
  runValidation: 'developer.runValidation',
  detectValidationCommands: 'developer.detectValidationCommands',
} as const;

export const DEVELOPER_VIEWS = {
  panel: 'developer.panel',
  log: 'developer.log',
  diff: 'developer.diff',
  validation: 'developer.validation',
  taskSummary: 'developer.taskSummary',
} as const;

export const DEVELOPER_SETTINGS_SECTION_ID = 'developer.settings';

export const DEVELOPER_STORAGE_KEYS = {
  commandHistory: 'developer.commandHistory',
  validationHistory: 'developer.validationHistory',
  latestDiff: 'developer.latestDiff',
  latestValidation: 'developer.latestValidation',
  latestTaskSummary: 'developer.latestTaskSummary',
  settings: 'developer.settings',
  commitDraft: 'developer.commitDraft',
} as const;

export const DEFAULT_VALIDATION_COMMANDS = ['npm run typecheck', 'npm run build', 'cargo check'];

export const MAX_COMMAND_HISTORY = 12;
export const MAX_VALIDATION_HISTORY = 12;
