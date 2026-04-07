import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Code2, FileCode2, GitBranch, Play, ScrollText } from 'lucide-react';
import { Button } from '../../../src/shared/ui/Button';
import { definePlugin, type LeftPanelProps, type WorkbenchProps } from '../../../src/plugin-host';
import type { BackendWorkspaceShellResult } from '../../../src/shared/types/api';
import type { ToolCall } from '../../../src/shared/types/schema';

interface RunCommandInput {
  command: string;
}

interface LogPayload extends BackendWorkspaceShellResult {
  source?: 'panel' | 'tool';
}

interface DiffPayload {
  title: string;
  raw: string;
  files: Array<{
    path: string;
    diff: string;
    additions: number;
    deletions: number;
  }>;
}

interface ValidationIssue {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface ValidationPayload {
  command: string;
  success: boolean;
  exitCode: number;
  durationMs: number;
  issues: ValidationIssue[];
  log: LogPayload;
}

const HISTORY_STORAGE_KEY = 'developer.commandHistory';
const SUGGESTED_COMMANDS = ['npm run typecheck', 'npm run build', 'cargo check'];

export default definePlugin({
  activate(ctx) {
    ctx.commands.register(
      'developer.runCommand',
      async ({ command }: RunCommandInput) => runTrackedCommand(ctx, command),
      {
        title: 'Run Command',
        description: 'Run a workspace command through the host shell API.',
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
      'developer.gitStatus',
      () => runTrackedCommand(ctx, 'git status --short'),
      { title: 'Git Status', description: 'Read current workspace git status.' },
    );

    ctx.ui.activityBar.register({
      id: 'developer.activity',
      title: 'Dev',
      icon: 'code',
      opens: 'developer.panel',
    });

    ctx.ui.leftPanel.register({
      id: 'developer.panel',
      title: 'Development',
      icon: 'code',
      component: DeveloperPanel,
    });

    ctx.ui.workbench.register<LogPayload>({
      id: 'developer.log',
      title: 'Command Log',
      component: CommandLogView,
    });

    ctx.ui.workbench.register<DiffPayload>({
      id: 'developer.diff',
      title: 'Diff',
      component: DiffView,
    });

    ctx.ui.workbench.register<ValidationPayload>({
      id: 'developer.validation',
      title: 'Validation',
      component: ValidationView,
    });

    ctx.ui.toolResultActions.register({
      id: 'developer.openShellLog',
      title: 'Open Log',
      description: 'Open shell tool output in the Developer log view.',
      order: 10,
      when: ({ tool }) => tool.name === 'shell' && tool.status !== 'running',
      run: ({ ctx, tool }) => {
        ctx.ui.workbench.open<LogPayload>({
          viewId: 'developer.log',
          title: shellToolTitle(tool),
          description: 'Shell tool output',
          payload: shellToolToLogPayload(tool),
        });
      },
    });
  },
});

async function runTrackedCommand(ctx: LeftPanelProps['ctx'], command: string) {
  const task = ctx.tasks.start({ title: command, detail: 'Running shell command' });
  try {
    const result = await ctx.shell.run(command, { timeoutMs: 30_000, maxOutputBytes: 512_000 });
    ctx.tasks.complete(task.id, result.success ? 'Command completed' : `Command exited with ${result.exit_code}`);
    return result;
  } catch (error) {
    ctx.tasks.fail(task.id, error);
    throw error;
  }
}

function DeveloperPanel({ ctx, width }: LeftPanelProps) {
  const [command, setCommand] = useState(SUGGESTED_COMMANDS[0]);
  const [recentResults, setRecentResults] = useState<LogPayload[]>([]);
  const [gitStatus, setGitStatus] = useState<LogPayload | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ctx.storage.get<LogPayload[]>(HISTORY_STORAGE_KEY).then((items) => {
      if (!cancelled) setRecentResults(items || []);
    });
    return () => {
      cancelled = true;
    };
  }, [ctx.storage]);

  const persistHistory = useCallback(async (next: LogPayload[]) => {
    setRecentResults(next);
    await ctx.storage.set(HISTORY_STORAGE_KEY, next);
  }, [ctx.storage]);

  const runCommand = async (nextCommand = command, mode: 'log' | 'validation' = 'log') => {
    if (!nextCommand.trim()) return;
    setCommand(nextCommand);
    setIsRunning(true);
    setError(null);
    try {
      const result = await ctx.commands.execute<RunCommandInput, BackendWorkspaceShellResult>('developer.runCommand', {
        command: nextCommand,
      });
      const payload: LogPayload = { ...result, source: 'panel' };
      await persistHistory([payload, ...recentResults.filter((item) => item.command !== payload.command)].slice(0, 12));
      if (mode === 'validation') {
        openValidation(ctx, payload);
      } else {
        openLog(ctx, payload);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '命令执行失败'));
    } finally {
      setIsRunning(false);
    }
  };

  const refreshGitStatus = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await ctx.commands.execute<unknown, BackendWorkspaceShellResult>('developer.gitStatus', {});
      const payload: LogPayload = { ...result, source: 'panel' };
      setGitStatus(payload);
      openLog(ctx, payload);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || 'Git status 失败'));
    } finally {
      setIsRunning(false);
    }
  };

  const openGitDiff = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const diff = await ctx.commands.execute<unknown, DiffPayload>('developer.gitDiff', {});
      ctx.ui.workbench.open<DiffPayload>({
        viewId: 'developer.diff',
        title: diff.title,
        description: `${diff.files.length} changed file(s)`,
        payload: diff,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || 'Git diff 失败'));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-full shrink-0 flex-col bg-[#f8f7f3]" style={{ width }}>
      <div className="px-4 pb-4 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
          <Code2 size={16} />
          <span>Developer</span>
        </div>
        <h2 className="mt-3 text-[20px] font-semibold text-slate-900">Development</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Run validation, inspect logs and review git diff.</p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-5">
        <section>
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Command</div>
          <textarea
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            className="min-h-[86px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 font-mono text-xs leading-5 text-slate-700 outline-none focus:border-amber-300"
          />
          {error && (
            <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
              {error}
            </div>
          )}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Button variant="primary" size="sm" onClick={() => void runCommand()} disabled={isRunning} className="justify-center rounded-2xl">
              <Play size={14} />
              {isRunning ? 'Running...' : 'Run'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void runCommand(command, 'validation')} disabled={isRunning} className="justify-center rounded-2xl">
              <CheckCircle2 size={14} />
              Validate
            </Button>
          </div>
        </section>

        <section>
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Suggested Validations</div>
          <div className="space-y-2">
            {SUGGESTED_COMMANDS.map((item) => (
              <Button
                key={item}
                variant="unstyled"
                size="none"
                onClick={() => void runCommand(item, 'validation')}
                className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
              >
                <ScrollText size={14} />
                <span className="truncate">{item}</span>
              </Button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Git</div>
          <div className="grid gap-2">
            <Button variant="unstyled" size="none" onClick={() => void refreshGitStatus()} className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50">
              <GitBranch size={14} />
              <span>Open git status</span>
            </Button>
            <Button variant="unstyled" size="none" onClick={() => void openGitDiff()} className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50">
              <FileCode2 size={14} />
              <span>Open git diff</span>
            </Button>
          </div>
          {gitStatus && (
            <div className="mt-2 rounded-2xl bg-white px-3 py-2 text-xs text-slate-500">
              {gitStatus.stdout.trim() || 'Working tree clean'}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Recent Logs</div>
          <div className="space-y-2">
            {recentResults.length > 0 ? recentResults.map((result, index) => (
              <Button
                key={`${result.command}-${index}`}
                variant="unstyled"
                size="none"
                onClick={() => openLog(ctx, result)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left text-xs text-slate-600 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-slate-800">{result.command}</span>
                  <span className={result.success ? 'text-emerald-600' : 'text-rose-600'}>{result.success ? 'ok' : result.exit_code}</span>
                </div>
              </Button>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">
                暂无命令结果
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function CommandLogView({ payload }: WorkbenchProps<LogPayload>) {
  return (
    <div className="h-full overflow-auto px-5 py-4">
      <CommandSummary payload={payload} />
      <LogBlock title="STDOUT" content={payload.stdout} />
      <LogBlock title="STDERR" content={payload.stderr} tone="error" />
    </div>
  );
}

function ValidationView({ payload }: WorkbenchProps<ValidationPayload>) {
  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${payload.success ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
        <div className="flex items-center gap-2 font-semibold">
          {payload.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{payload.success ? 'Validation passed' : 'Validation failed'}</span>
        </div>
        <div className="mt-1 text-xs">{payload.command} · exit {payload.exitCode} · {(payload.durationMs / 1000).toFixed(1)}s</div>
      </div>
      <section className="mb-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Issues</div>
        {payload.issues.length > 0 ? (
          <div className="space-y-2">
            {payload.issues.map((issue, index) => (
              <div key={index} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <div className={issue.severity === 'error' ? 'text-rose-700' : 'text-amber-700'}>{issue.message}</div>
                {issue.file && <div className="mt-1 text-xs text-slate-500">{issue.file}{issue.line ? `:${issue.line}` : ''}{issue.column ? `:${issue.column}` : ''}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            没有解析到结构化问题，详见日志。
          </div>
        )}
      </section>
      <CommandLogView payload={payload.log} />
    </div>
  );
}

function DiffView({ payload }: WorkbenchProps<DiffPayload>) {
  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <div className="font-medium text-slate-800">{payload.title}</div>
        <div className="mt-1">{payload.files.length} changed file(s)</div>
      </div>
      {payload.files.length > 0 ? (
        <div className="space-y-4">
          {payload.files.map((file) => (
            <div key={file.path} className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700">
                <span className="truncate">{file.path}</span>
                <span className="shrink-0 text-slate-400">+{file.additions} -{file.deletions}</span>
              </div>
              <pre className="whitespace-pre-wrap bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">{file.diff}</pre>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          当前没有 git diff。
        </div>
      )}
    </div>
  );
}

function CommandSummary({ payload }: { payload: LogPayload }) {
  return (
    <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
      <div className="font-medium text-slate-800">{payload.command}</div>
      <div className="mt-1">
        {payload.success ? 'Success' : `Failed with exit code ${payload.exit_code}`}
        {payload.timed_out ? ' · timed out' : ''}
        {payload.truncated ? ' · output truncated' : ''}
        {` · ${(payload.duration_ms / 1000).toFixed(1)}s`}
      </div>
    </div>
  );
}

function LogBlock({ title, content, tone = 'default' }: { title: string; content?: string; tone?: 'default' | 'error' }) {
  return (
    <section className="mb-4">
      <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">{title}</div>
      <pre className={`min-h-[120px] whitespace-pre-wrap rounded-2xl px-4 py-4 text-xs leading-6 ${
        tone === 'error' ? 'bg-rose-950 text-rose-50' : 'bg-slate-950 text-slate-100'
      }`}>
        {content || '无输出'}
      </pre>
    </section>
  );
}

function openLog(ctx: LeftPanelProps['ctx'], payload: LogPayload) {
  ctx.ui.workbench.open<LogPayload>({
    viewId: 'developer.log',
    title: payload.command,
    description: payload.success ? 'Command completed successfully' : `Command failed with exit code ${payload.exit_code}`,
    payload,
  });
}

function openValidation(ctx: LeftPanelProps['ctx'], log: LogPayload) {
  const payload: ValidationPayload = {
    command: log.command,
    success: log.success,
    exitCode: log.exit_code,
    durationMs: log.duration_ms,
    issues: parseValidationIssues(`${log.stdout}\n${log.stderr}`),
    log,
  };
  ctx.ui.workbench.open<ValidationPayload>({
    viewId: 'developer.validation',
    title: `Validation: ${log.command}`,
    description: payload.success ? 'Validation passed' : `${payload.issues.length} issue(s) detected`,
    payload,
  });
}

function parseGitDiff(raw: string): DiffPayload {
  const files: DiffPayload['files'] = [];
  const chunks = raw.split(/^diff --git /m).filter(Boolean);
  for (const chunk of chunks) {
    const text = `diff --git ${chunk}`;
    const header = text.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    const path = header?.[2] || header?.[1] || 'unknown';
    const lines = text.split('\n');
    const additions = lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
    const deletions = lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length;
    files.push({ path, diff: text, additions, deletions });
  }
  return { title: 'Git Diff', raw, files };
}

function parseValidationIssues(output: string): ValidationIssue[] {
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

function shellToolTitle(tool: ToolCall) {
  const args = tool.arguments && typeof tool.arguments === 'object' ? tool.arguments as { command?: string } : {};
  return args.command || 'Shell Log';
}

function shellToolToLogPayload(tool: ToolCall): LogPayload {
  const command = shellToolTitle(tool);
  const output = [tool.logs?.join('\n'), tool.result].filter(Boolean).join('\n');
  return {
    command,
    stdout: output,
    stderr: tool.status === 'error' ? output : '',
    exit_code: tool.status === 'error' ? 1 : 0,
    success: tool.status !== 'error',
    timed_out: false,
    truncated: false,
    duration_ms: tool.executionTime || 0,
    source: 'tool',
  };
}
