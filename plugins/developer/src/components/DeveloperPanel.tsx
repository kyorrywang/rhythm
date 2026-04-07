import { useEffect, useState } from 'react';
import { Code2 } from 'lucide-react';
import type { LeftPanelProps } from '../../../../src/plugin-host';
import { DEVELOPER_COMMANDS, DEVELOPER_STORAGE_KEYS, DEVELOPER_VIEWS, SUGGESTED_COMMANDS } from '../constants';
import { useCommandHistory } from '../hooks/useCommandHistory';
import { useValidationHistory } from '../hooks/useValidationHistory';
import type { DiffPayload, GitStatusEntry, LogPayload, RunCommandInput, ShellCommandResult } from '../types';
import { createValidationPayload, parseGitStatus } from '../utils';
import { CommandRunner } from './CommandRunner';
import { GitPanel } from './GitPanel';
import { RecentLogs } from './RecentLogs';
import { ValidationHistory } from './ValidationHistory';
import { ValidationPresets } from './ValidationPresets';

export function DeveloperPanel({ ctx, width }: LeftPanelProps) {
  const [command, setCommand] = useState(SUGGESTED_COMMANDS[0]);
  const [validationCommands, setValidationCommands] = useState<string[]>(SUGGESTED_COMMANDS);
  const [gitStatus, setGitStatus] = useState<LogPayload | null>(null);
  const [changedFiles, setChangedFiles] = useState<GitStatusEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useCommandHistory(ctx);
  const validationHistory = useValidationHistory(ctx);

  useEffect(() => {
    let cancelled = false;
    void ctx.commands.execute<unknown, string[]>(DEVELOPER_COMMANDS.detectValidationCommands, {}).then((items) => {
      if (!cancelled && items.length > 0) setValidationCommands(items);
    });
    return () => {
      cancelled = true;
    };
  }, [ctx.commands]);

  const runCommand = async (nextCommand = command, mode: 'log' | 'validation' = 'log') => {
    if (!nextCommand.trim()) return;
    setCommand(nextCommand);
    setIsRunning(true);
    setError(null);
    try {
      const result = await ctx.commands.execute<RunCommandInput, ShellCommandResult>(DEVELOPER_COMMANDS.runCommand, {
        command: nextCommand,
      });
      const payload: LogPayload = { ...result, source: 'panel' };
      await history.remember(payload);
      if (mode === 'validation') {
        const validation = createValidationPayload(payload);
        await validationHistory.remember(validation);
        openValidation(ctx, validation);
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
      const result = await ctx.commands.execute<unknown, ShellCommandResult>(DEVELOPER_COMMANDS.gitStatus, {});
      const payload: LogPayload = { ...result, source: 'panel' };
      setGitStatus(payload);
      const files = parseGitStatus(payload.stdout);
      setChangedFiles(files);
      ctx.events.emit('developer.gitStatusChanged', { files });
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
    const message = window.prompt('Commit message');
    if (!message?.trim()) return;
    setIsRunning(true);
    setError(null);
    try {
      const result = await ctx.commands.execute<{ message: string }, ShellCommandResult>(DEVELOPER_COMMANDS.commit, { message });
      const payload: LogPayload = { ...result, source: 'panel' };
      await history.remember(payload);
      openLog(ctx, payload);
      await refreshGitStatus();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || 'Commit 失败'));
    } finally {
      setIsRunning(false);
    }
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
        />

        <ValidationPresets commands={validationCommands} onRun={(item) => void runCommand(item, 'validation')} />

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
        />

        <ValidationHistory entries={validationHistory.entries} onOpen={(entry) => openValidation(ctx, entry)} />

        <RecentLogs entries={history.entries} onOpen={(entry) => openLog(ctx, entry)} onClear={() => void history.clear()} />
      </div>
    </div>
  );
}

function openLog(ctx: LeftPanelProps['ctx'], payload: LogPayload) {
  ctx.ui.workbench.open<LogPayload>({
    viewId: DEVELOPER_VIEWS.log,
    title: payload.command,
    description: payload.success ? 'Command completed successfully' : `Command failed with exit code ${payload.exit_code}`,
    payload,
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
