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
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  success: boolean;
  timed_out: boolean;
  truncated: boolean;
  duration_ms: number;
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
}
