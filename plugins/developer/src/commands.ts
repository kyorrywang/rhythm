import type { LeftPanelProps } from '../../../src/plugin/sdk';
import { DEFAULT_VALIDATION_COMMANDS } from './constants';
import type { CommitInput, FilePathInput, RunCommandInput, ShellCommandResult, ValidationPreset } from './types';
import { classifyValidationCommand, createValidationPayload, escapeShellPath, parseExitCode, parseGitDiff } from './utils';

export function registerDeveloperCommands(ctx: LeftPanelProps['ctx']) {
  ctx.commands.register(
    'developer.runCommand',
    async ({ command }: RunCommandInput) => runTrackedCommand(ctx, command),
    {
      title: 'Run Command',
      description: 'Run a workspace command through the unified command API.',
      inputSchema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  );

  ctx.commands.register(
    'developer.gitDiff',
    async () => {
      const result = await runTrackedCommand(ctx, 'git diff --no-ext-diff --');
      return parseGitDiff(result.stdout || result.stderr || '');
    },
    { title: 'Git Diff', description: 'Read current workspace git diff.' },
  );

  ctx.commands.register(
    'developer.gitDiffFile',
    async ({ path }: FilePathInput) => {
      const result = await runTrackedCommand(ctx, `git diff --no-ext-diff -- "${escapeShellPath(path)}"`);
      return parseGitDiff(result.stdout || result.stderr || '');
    },
    { title: 'Git Diff File', description: 'Read git diff for one file.' },
  );

  ctx.commands.register(
    'developer.stageFile',
    ({ path }: FilePathInput) => runTrackedCommand(ctx, `git add -- "${escapeShellPath(path)}"`),
    { title: 'Stage File', description: 'Stage one file with git add.' },
  );

  ctx.commands.register(
    'developer.unstageFile',
    ({ path }: FilePathInput) => runTrackedCommand(ctx, `git restore --staged -- "${escapeShellPath(path)}"`),
    { title: 'Unstage File', description: 'Unstage one file with git restore --staged.' },
  );

  ctx.commands.register(
    'developer.stagedDiff',
    async () => {
      const result = await runTrackedCommand(ctx, 'git diff --cached --no-ext-diff --');
      return parseGitDiff(result.stdout || result.stderr || '');
    },
    { title: 'Staged Diff', description: 'Read current staged git diff.' },
  );

  ctx.commands.register(
    'developer.commit',
    ({ message }: CommitInput) => runTrackedCommand(ctx, `git commit -m "${escapeShellPath(message)}"`),
    {
      title: 'Commit',
      description: 'Commit staged changes with a commit message.',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    },
  );

  ctx.commands.register(
    'developer.runValidation',
    async ({ command }: RunCommandInput) => {
      const log = await runTrackedCommand(ctx, command);
      return createValidationPayload(log);
    },
    {
      title: 'Run Validation',
      description: 'Run a validation command and parse common diagnostics.',
      inputSchema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  );

  ctx.commands.register(
    'developer.detectValidationCommands',
    () => detectValidationCommands(ctx),
    { title: 'Detect Validation Commands', description: 'Suggest common validation commands.' },
  );

  ctx.commands.register(
    'developer.gitStatus',
    () => runTrackedCommand(ctx, 'git status --short'),
    { title: 'Git Status', description: 'Read current workspace git status.' },
  );
}

async function detectValidationCommands(ctx: LeftPanelProps['ctx']) {
  const suggestions = new Map<string, ValidationPreset>();
  try {
    const result = await ctx.commands.execute<unknown, { entries?: Array<{ name: string; kind: string }> }>('tool.list_dir', {});
    const names = new Set((result.entries || []).map((entry) => entry.name));
    if (names.has('package.json')) {
      const pkgText = await ctx.commands.execute<{ path: string }, string | { output?: string }>('tool.read_file', { path: 'package.json' });
      const pkgJson = JSON.parse(typeof pkgText === 'string' ? pkgText : pkgText.output || '{}');
      const scripts = pkgJson?.scripts && typeof pkgJson.scripts === 'object' ? pkgJson.scripts : {};
      for (const scriptName of Object.keys(scripts)) {
        const command = `npm run ${scriptName}`;
        suggestions.set(command, {
          id: command,
          label: command,
          command,
          kind: classifyValidationCommand(command),
        });
      }
    }
    if (names.has('Cargo.toml')) {
      for (const command of ['cargo check', 'cargo test']) {
        suggestions.set(command, { id: command, label: command, command, kind: classifyValidationCommand(command) });
      }
    }
    if (names.has('pyproject.toml') || names.has('requirements.txt')) {
      const command = 'python -m pytest';
      suggestions.set(command, { id: command, label: command, command, kind: classifyValidationCommand(command) });
    }
  } catch {
    // Fall through to defaults when the workspace cannot be inspected.
  }
  for (const command of DEFAULT_VALIDATION_COMMANDS) {
    suggestions.set(command, { id: command, label: command, command, kind: classifyValidationCommand(command) });
  }
  return Array.from(suggestions.values());
}

export async function runTrackedCommand(ctx: LeftPanelProps['ctx'], command: string) {
  const task = ctx.tasks.start({ title: command, detail: 'Running shell command' });
  const startedAt = performance.now();
  try {
    const output = await ctx.commands.execute<{ command: string }, string | { output?: string }>('tool.shell', { command });
    const text = typeof output === 'string' ? output : output.output || '';
    const result: ShellCommandResult = {
      command,
      stdout: text,
      stderr: '',
      exit_code: 0,
      success: true,
      timed_out: false,
      truncated: false,
      duration_ms: Math.round(performance.now() - startedAt),
    };
    ctx.tasks.complete(task.id, 'Command completed');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Command failed');
    const result: ShellCommandResult = {
      command,
      stdout: '',
      stderr: message,
      exit_code: parseExitCode(message) ?? 1,
      success: false,
      timed_out: false,
      truncated: false,
      duration_ms: Math.round(performance.now() - startedAt),
    };
    ctx.tasks.fail(task.id, error);
    return result;
  }
}
