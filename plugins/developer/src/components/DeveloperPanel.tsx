import { useEffect, useState } from 'react';
import { Code2 } from 'lucide-react';
import type { LeftPanelProps, RunningCommand } from '../../../../src/plugin/sdk';
import { DEVELOPER_COMMANDS, DEVELOPER_STORAGE_KEYS, DEVELOPER_VIEWS, DEFAULT_VALIDATION_COMMANDS } from '../constants';
import { useCommandHistory } from '../hooks/useCommandHistory';
import { useDeveloperSettings } from '../hooks/useDeveloperSettings';
import { useValidationHistory } from '../hooks/useValidationHistory';
import type { DeveloperTaskSummary, DiffPayload, GitStatusEntry, LogPayload, RunCommandInput, ShellCommandResult, ValidationPreset } from '../types';
import { createTaskSummary, createValidationPayload, parseGitStatus } from '../utils';
import { CommandRunner } from './CommandRunner';
import { GitPanel } from './GitPanel';
import { RecentLogs } from './RecentLogs';
import { ValidationHistory } from './ValidationHistory';
import { ValidationPresets } from './ValidationPresets';

export function DeveloperPanel({ ctx, width }: LeftPanelProps) {
  const [command, setCommand] = useState(DEFAULT_VALIDATION_COMMANDS[0]);
  const [validationCommands, setValidationCommands] = useState<ValidationPreset[]>([]);
  const [gitStatus, setGitStatus] = useState<LogPayload | null>(null);
  const [changedFiles, setChangedFiles] = useState<GitStatusEntry[]>([]);
  const [commitDraft, setCommitDraft] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [activeRun, setActiveRun] = useState<RunningCommand<ShellCommandResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const history = useCommandHistory(ctx);
  const validationHistory = useValidationHistory(ctx);
  const { settings } = useDeveloperSettings(ctx);

  useEffect(() => {
    let cancelled = false;
    void ctx.storage.get<string>(DEVELOPER_STORAGE_KEYS.commitDraft).then((value) => {
      if (!cancelled) setCommitDraft(value || '');
    });
    return () => {
      cancelled = true;
    };
  }, [ctx.storage]);

  useEffect(() => {
    let cancelled = false;
    void ctx.commands.execute<unknown, ValidationPreset[]>(DEVELOPER_COMMANDS.detectValidationCommands, {}).then((items) => {
      if (!cancelled && items.length > 0) setValidationCommands(items);
    });
    return () => {
      cancelled = true;
    };
  }, [ctx.commands]);

  useEffect(() => {
    if (settings.validationPresets.length > 0) {
      setValidationCommands(settings.validationPresets);
    } else {
      setValidationCommands(DEFAULT_VALIDATION_COMMANDS.map((command) => ({
        id: command,
        label: command,
        command,
        kind: 'custom',
      })));
    }
  }, [settings.validationPresets]);

  useEffect(() => {
    if (!settings.autoRefreshGitStatus) return;
    void refreshGitStatus();
  }, [settings.autoRefreshGitStatus]);

  const saveTaskSummary = async (input: {
    latestLog?: LogPayload | null;
    latestValidation?: ReturnType<typeof createValidationPayload> | null;
    latestDiff?: DiffPayload | null;
    changedFiles?: GitStatusEntry[];
  }) => {
    const previous = await ctx.storage.get<DeveloperTaskSummary>(DEVELOPER_STORAGE_KEYS.latestTaskSummary);
    const summary = createTaskSummary({
      latestLog: input.latestLog ?? previous?.latestLog ?? null,
      latestValidation: input.latestValidation ?? previous?.latestValidation ?? null,
      latestDiff: input.latestDiff
        ? {
            title: input.latestDiff.title,
            raw: '',
            files: input.latestDiff.files,
          }
        : null,
      changedFiles: input.changedFiles ?? previous?.changedFiles ?? changedFiles,
    });
    await ctx.storage.set(DEVELOPER_STORAGE_KEYS.latestTaskSummary, summary);
  };

  const runCommand = async (nextCommand = command, mode: 'log' | 'validation' = 'log') => {
    if (!nextCommand.trim()) return;
    setCommand(nextCommand);
    setIsRunning(true);
    setError(null);
    try {
      const liveViewId = `developer.log:${Date.now()}`;
      let payload: LogPayload = {
        run_id: liveViewId,
        command: nextCommand,
        stdout: '',
        stderr: '',
        exit_code: 0,
        success: false,
        timed_out: false,
        truncated: false,
        duration_ms: 0,
        source: 'panel',
        status: 'running',
      };
      openLog(ctx, payload, liveViewId, 'live');
      const running = await ctx.commands.start<RunCommandInput, ShellCommandResult>(
        'tool.shell',
        { command: nextCommand },
        (event) => {
          if (event.type === 'stdout') {
            payload = { ...payload, stdout: `${payload.stdout}${event.chunk}` };
            openLog(ctx, payload, liveViewId, 'live');
          } else if (event.type === 'stderr') {
            payload = { ...payload, stderr: `${payload.stderr}${event.chunk}` };
            openLog(ctx, payload, liveViewId, 'live');
          } else if (event.type === 'completed') {
            payload = {
              ...event.result,
              run_id: event.runId,
              source: 'panel',
              status: 'completed',
            };
            openLog(ctx, payload, liveViewId, 'snapshot');
          } else if (event.type === 'cancelled') {
            payload = {
              ...payload,
              run_id: event.runId,
              status: 'cancelled',
            };
            openLog(ctx, payload, liveViewId, 'snapshot');
          } else if (event.type === 'error') {
            payload = {
              ...payload,
              stderr: `${payload.stderr}${payload.stderr ? '\n' : ''}${event.message}`,
              status: 'error',
            };
            openLog(ctx, payload, liveViewId, 'snapshot');
          }
        },
      );
      setActiveRun(running);
      const result = await running.result;
      payload = { ...result, source: 'panel', run_id: running.runId, status: 'completed' };
      await history.remember(payload);
      if (mode === 'validation') {
        const validation = createValidationPayload(payload);
        await validationHistory.remember(validation);
        await saveTaskSummary({ latestLog: payload, latestValidation: validation });
        openValidation(ctx, validation);
      } else {
        await saveTaskSummary({ latestLog: payload });
        openLog(ctx, payload, liveViewId);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '命令执行失败'));
    } finally {
      setActiveRun(null);
      setIsRunning(false);
    }
  };

  const refreshGitStatus = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await ctx.commands.execute<unknown, ShellCommandResult>(DEVELOPER_COMMANDS.gitStatus, {});
      const payload: LogPayload = { ...result, source: 'panel' };
      setGitStatus(payload);
      const files = parseGitStatus(payload.stdout);
      setChangedFiles(files);
      await saveTaskSummary({ latestLog: payload, changedFiles: files });
      if (settings.syncFolderBadges) {
        ctx.events.emit('developer.gitStatusChanged', { files });
      }
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
      const diff = await ctx.commands.execute<unknown, DiffPayload>(DEVELOPER_COMMANDS.gitDiff, {});
      await ctx.storage.set(DEVELOPER_STORAGE_KEYS.latestDiff, diff);
      await saveTaskSummary({ latestDiff: diff });
      ctx.ui.workbench.open<DiffPayload>({
        viewId: DEVELOPER_VIEWS.diff,
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

  const openStagedDiff = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const diff = await ctx.commands.execute<unknown, DiffPayload>(DEVELOPER_COMMANDS.stagedDiff, {});
      const payload = { ...diff, title: 'Staged Diff' };
      await ctx.storage.set(DEVELOPER_STORAGE_KEYS.latestDiff, payload);
      await saveTaskSummary({ latestDiff: payload });
      ctx.ui.workbench.open<DiffPayload>({
        viewId: DEVELOPER_VIEWS.diff,
        title: payload.title,
        description: `${payload.files.length} changed file(s)`,
        payload,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || 'Staged diff 失败'));
    } finally {
      setIsRunning(false);
    }
  };

  const openFileDiff = async (path: string) => {
    setIsRunning(true);
    setError(null);
    try {
      const diff = await ctx.commands.execute<{ path: string }, DiffPayload>(DEVELOPER_COMMANDS.gitDiffFile, { path });
      const payload = { ...diff, title: `Diff: ${path}` };
      await ctx.storage.set(DEVELOPER_STORAGE_KEYS.latestDiff, payload);
      await saveTaskSummary({ latestDiff: payload });
      ctx.ui.workbench.open<DiffPayload>({
        viewId: DEVELOPER_VIEWS.diff,
        title: `Diff: ${path}`,
        description: `${diff.files.length} changed file(s)`,
        payload,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || 'Git diff file 失败'));
    } finally {
      setIsRunning(false);
    }
  };

  const commitStagedChanges = async () => {
    if (!commitDraft.trim()) return;
    setIsRunning(true);
    setError(null);
    try {
      const result = await ctx.commands.execute<{ message: string }, ShellCommandResult>(DEVELOPER_COMMANDS.commit, { message: commitDraft });
      const payload: LogPayload = { ...result, source: 'panel' };
      await history.remember(payload);
      await saveTaskSummary({ latestLog: payload });
      setCommitDraft('');
      await ctx.storage.set(DEVELOPER_STORAGE_KEYS.commitDraft, '');
      openLog(ctx, payload);
      await refreshGitStatus();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || 'Commit 失败'));
    } finally {
      setIsRunning(false);
    }
  };

  const updateCommitDraft = async (value: string) => {
    setCommitDraft(value);
    await ctx.storage.set(DEVELOPER_STORAGE_KEYS.commitDraft, value);
  };

  const revealFile = async (path: string) => {
    try {
      await ctx.commands.execute('folder.reveal', { path });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || 'Reveal 失败'));
    }
  };

  const runGitFileAction = async (commandId: string, path: string) => {
    setIsRunning(true);
    setError(null);
    try {
      await ctx.commands.execute(commandId, { path });
      await refreshGitStatus();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || 'Git 文件操作失败'));
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
        <CommandRunner
          command={command}
          isRunning={isRunning}
          error={error}
          onCommandChange={setCommand}
          onRun={() => void runCommand()}
          onValidate={() => void runCommand(command, 'validation')}
          onCancel={() => void activeRun?.cancel()}
        />

        <ValidationPresets presets={validationCommands} onRun={(item) => void runCommand(item, 'validation')} />

        <GitPanel
          gitStatus={gitStatus}
          changedFiles={changedFiles}
          onRefreshStatus={() => void refreshGitStatus()}
          onOpenDiff={() => void openGitDiff()}
          onOpenStagedDiff={() => void openStagedDiff()}
          onOpenFileDiff={(path) => void openFileDiff(path)}
          onRevealFile={(path) => void revealFile(path)}
          onStageFile={(path) => void runGitFileAction(DEVELOPER_COMMANDS.stageFile, path)}
          onUnstageFile={(path) => void runGitFileAction(DEVELOPER_COMMANDS.unstageFile, path)}
          onCommit={() => void commitStagedChanges()}
          commitDraft={commitDraft}
          onCommitDraftChange={(value) => void updateCommitDraft(value)}
        />

        <ValidationHistory entries={validationHistory.entries} onOpen={(entry) => openValidation(ctx, entry)} onClear={() => void validationHistory.clear()} />

        <RecentLogs entries={history.entries} onOpen={(entry) => openLog(ctx, entry)} onClear={() => void history.clear()} />
      </div>
    </div>
  );
}

function openLog(
  ctx: LeftPanelProps['ctx'],
  payload: LogPayload,
  id?: string,
  lifecycle: 'snapshot' | 'live' = 'snapshot',
) {
  const description = payload.status === 'running'
    ? 'Command is running'
    : payload.status === 'cancelled'
      ? 'Command was cancelled'
      : payload.success
        ? 'Command completed successfully'
        : `Command failed with exit code ${payload.exit_code}`;
  ctx.ui.workbench.open<LogPayload>({
    id,
    viewId: DEVELOPER_VIEWS.log,
    title: payload.command,
    description,
    payload,
    lifecycle,
  });
}

function openValidation(ctx: LeftPanelProps['ctx'], payload: ReturnType<typeof createValidationPayload>) {
  ctx.ui.workbench.open({
    viewId: DEVELOPER_VIEWS.validation,
    title: `Validation: ${payload.command}`,
    description: payload.success ? 'Validation passed' : `${payload.issues.length} issue(s) detected`,
    payload,
  });
}
