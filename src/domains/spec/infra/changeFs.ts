import path from 'node:path';

export const SPEC_ROOT_DIRNAME = '.spec';
export const SPEC_CHANGES_DIRNAME = 'changes';
export const SPEC_ARTIFACTS_DIRNAME = 'artifacts';
export const SPEC_REVIEWS_DIRNAME = 'reviews';
export const SPEC_RUNS_DIRNAME = 'runs';

export const SPEC_CHANGE_FILE_NAMES = {
  change: 'change.md',
  plan: 'plan.md',
  tasks: 'tasks.md',
  state: 'state.json',
  timeline: 'timeline.jsonl',
} as const;

export interface SpecChangePaths {
  rootDir: string;
  changesDir: string;
  changeDir: string;
  artifactsDir: string;
  reviewsDir: string;
  runsDir: string;
  changeFile: string;
  planFile: string;
  tasksFile: string;
  stateFile: string;
  timelineFile: string;
}

export function makeSpecChangeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'change';
}

export function getSpecRootDir(workspacePath: string) {
  return path.join(workspacePath, SPEC_ROOT_DIRNAME);
}

export function getSpecChangesDir(workspacePath: string) {
  return path.join(getSpecRootDir(workspacePath), SPEC_CHANGES_DIRNAME);
}

export function getSpecChangeDir(workspacePath: string, slug: string) {
  return path.join(getSpecChangesDir(workspacePath), slug);
}

export function getSpecChangePaths(workspacePath: string, slug: string): SpecChangePaths {
  const rootDir = getSpecRootDir(workspacePath);
  const changesDir = getSpecChangesDir(workspacePath);
  const changeDir = getSpecChangeDir(workspacePath, slug);
  return {
    rootDir,
    changesDir,
    changeDir,
    artifactsDir: path.join(changeDir, SPEC_ARTIFACTS_DIRNAME),
    reviewsDir: path.join(changeDir, SPEC_REVIEWS_DIRNAME),
    runsDir: path.join(changeDir, SPEC_RUNS_DIRNAME),
    changeFile: path.join(changeDir, SPEC_CHANGE_FILE_NAMES.change),
    planFile: path.join(changeDir, SPEC_CHANGE_FILE_NAMES.plan),
    tasksFile: path.join(changeDir, SPEC_CHANGE_FILE_NAMES.tasks),
    stateFile: path.join(changeDir, SPEC_CHANGE_FILE_NAMES.state),
    timelineFile: path.join(changeDir, SPEC_CHANGE_FILE_NAMES.timeline),
  };
}

export function toSpecRelativePath(workspacePath: string, absolutePath: string) {
  const relativePath = path.relative(workspacePath, absolutePath).replace(/\\/g, '/');
  return relativePath.length > 0 ? relativePath : '.';
}
