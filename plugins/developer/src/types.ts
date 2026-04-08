export interface RunCommandInput {
  command: string;
}

export interface FilePathInput {
  path: string;
}

export interface CommitInput {
  message: string;
}

export interface ShellCommandResult {
  run_id?: string;
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  success: boolean;
  timed_out: boolean;
  truncated: boolean;
  duration_ms: number;
  status?: 'running' | 'completed' | 'cancelled' | 'error';
}

export interface LogPayload extends ShellCommandResult {
  source?: 'panel' | 'tool';
}

export interface DiffPayload {
  title: string;
  raw: string;
  files: Array<{
    path: string;
    diff: string;
    additions: number;
    deletions: number;
    hunks: DiffHunk[];
  }>;
}

export interface DiffHunk {
  header: string;
  lines: string[];
  additions: number;
  deletions: number;
}

export interface ValidationIssue {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationPayload {
  command: string;
  success: boolean;
  exitCode: number;
  durationMs: number;
  issues: ValidationIssue[];
  log: LogPayload;
}

export interface GitStatusEntry {
  path: string;
  status: string;
  stagedStatus?: string;
  unstagedStatus?: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isUntracked: boolean;
  isConflict: boolean;
  originalPath?: string;
}

export interface ValidationPreset {
  id: string;
  label: string;
  command: string;
  kind: 'typecheck' | 'build' | 'test' | 'lint' | 'custom';
}

export interface DeveloperSettings {
  validationPresets: ValidationPreset[];
  autoRefreshGitStatus: boolean;
  syncFolderBadges: boolean;
}

export interface DeveloperTaskSummary {
  title: string;
  updatedAt: number;
  latestLog?: LogPayload | null;
  latestValidation?: ValidationPayload | null;
  latestDiff?: {
    title: string;
    fileCount: number;
    additions: number;
    deletions: number;
  } | null;
  changedFiles: GitStatusEntry[];
}
