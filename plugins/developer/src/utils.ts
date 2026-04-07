import type { DiffPayload, GitStatusEntry, LogPayload, ValidationIssue, ValidationPayload } from './types';

export function createValidationPayload(log: LogPayload): ValidationPayload {
  return {
    command: log.command,
    success: log.success,
    exitCode: log.exit_code,
    durationMs: log.duration_ms,
    issues: parseValidationIssues(`${log.stdout}\n${log.stderr}`),
    log,
  };
}

export function parseGitDiff(raw: string): DiffPayload {
  const files: DiffPayload['files'] = [];
  const chunks = raw.split(/^diff --git /m).filter(Boolean);
  for (const chunk of chunks) {
    const text = `diff --git ${chunk}`;
    const header = text.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    const path = header?.[2] || header?.[1] || 'unknown';
    const lines = text.split('\n');
    const additions = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
    const deletions = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length;
    files.push({ path, diff: text, additions, deletions, hunks: parseDiffHunks(lines) });
  }
  return { title: 'Git Diff', raw, files };
}

function parseDiffHunks(lines: string[]) {
  const hunks: DiffPayload['files'][number]['hunks'] = [];
  let current: DiffPayload['files'][number]['hunks'][number] | null = null;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (current) hunks.push(current);
      current = { header: line, lines: [], additions: 0, deletions: 0 };
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    if (line.startsWith('+') && !line.startsWith('+++')) current.additions += 1;
    if (line.startsWith('-') && !line.startsWith('---')) current.deletions += 1;
  }
  if (current) hunks.push(current);
  return hunks;
}

export function parseGitStatus(output: string): GitStatusEntry[] {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim() || '?',
      path: line.slice(3).trim() || line.trim(),
    }))
    .filter((entry) => Boolean(entry.path));
}

export function parseValidationIssues(output: string): ValidationIssue[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): ValidationIssue | null => {
      const match = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning)?\s*(.*)$/i)
        || line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)?\s*(.*)$/i);
      if (!match) {
        if (/error|failed|panic/i.test(line)) return { message: line, severity: 'error' };
        if (/warning/i.test(line)) return { message: line, severity: 'warning' };
        return null;
      }
      return {
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        severity: /warning/i.test(match[4] || '') ? 'warning' : 'error',
        message: match[5] || line,
      };
    })
    .filter((issue): issue is ValidationIssue => Boolean(issue))
    .slice(0, 80);
}

export function parseExitCode(message: string) {
  const match = message.match(/Exit code:\s*(-?\d+)/i);
  return match ? Number(match[1]) : null;
}

export function escapeShellPath(path: string) {
  return path.replace(/"/g, '\\"');
}
