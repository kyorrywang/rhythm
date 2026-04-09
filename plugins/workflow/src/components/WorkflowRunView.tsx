import { useEffect, useMemo, useState } from 'react';
import { Circle, CircleCheck, CirclePause, CircleX, Loader2, Play, RotateCcw, Square } from 'lucide-react';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { Button } from '../../../../src/shared/ui/Button';
import { WORKFLOW_COMMANDS, WORKFLOW_EVENTS, WORKFLOW_VIEWS } from '../constants';
import type { WorkflowNodeRun, WorkflowRunPayload } from '../types';
import { formatDate } from '../utils';

export function WorkflowRunView({ ctx, payload }: WorkbenchProps<WorkflowRunPayload>) {
  const [current, setCurrent] = useState(payload);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(payload);
  }, [payload]);

  useEffect(() => {
    const disposable = ctx.events.on(WORKFLOW_EVENTS.runUpdated, (event) => {
      const next = event as WorkflowRunPayload;
      if (next.run?.id === current.run.id) {
        setCurrent(next);
      }
    });
    return () => disposable.dispose();
  }, [ctx.events, current.run.id]);

  const currentNodeTitle = useMemo(() => {
    if (!current.run.currentNodeId) return null;
    return current.workflow.nodes.find((node) => node.id === current.run.currentNodeId)?.title || current.run.currentNodeId;
  }, [current.run.currentNodeId, current.workflow.nodes]);

  const cancel = async () => {
    try {
      await ctx.commands.execute(WORKFLOW_COMMANDS.cancel, { runId: current.run.id });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '取消失败'));
    }
  };

  const pause = async () => {
    try {
      await ctx.commands.execute(WORKFLOW_COMMANDS.pause, { runId: current.run.id });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '暂停失败'));
    }
  };

  const resume = async () => {
    try {
      await ctx.commands.execute(WORKFLOW_COMMANDS.resume, { runId: current.run.id });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '恢复失败'));
    }
  };

  const retry = async () => {
    try {
      await ctx.commands.execute(WORKFLOW_COMMANDS.retry, { runId: current.run.id });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '重试失败'));
    }
  };

  const failedNode = useMemo(
    () => Object.values(current.run.nodeRuns).find((nodeRun) => nodeRun.status === 'error'),
    [current.run.nodeRuns],
  );
  const loopContext = current.run.variables?.loop as { index?: unknown; item?: unknown; iteration?: unknown } | undefined;

  const inspect = (nodeRun: WorkflowNodeRun) => {
    const node = current.workflow.nodes.find((item) => item.id === nodeRun.nodeId);
    if (!node) return;
    ctx.ui.overlay.open({
      viewId: WORKFLOW_VIEWS.nodeInspector,
      title: node.title,
      description: `Node status: ${nodeRun.status}`,
      payload: { workflow: current.workflow, run: current.run, node, nodeRun },
      kind: 'drawer',
    });
  };

  return (
    <div className="flex h-full flex-col bg-[#fbfaf7] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Workflow Run</div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">{current.workflow.name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {current.run.status} · started {formatDate(current.run.startedAt)}
          </p>
          {currentNodeTitle && (
            <p className="mt-1 text-sm text-slate-500">current node: {currentNodeTitle}</p>
          )}
          {current.run.resumeFromNodeId && current.run.status === 'paused' && (
            <p className="mt-1 text-sm text-slate-500">resume from: {current.run.resumeFromNodeId}</p>
          )}
          {failedNode && (
            <p className="mt-1 text-sm text-slate-500">failed node: {failedNode.title}</p>
          )}
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void pause()} disabled={current.run.status !== 'running'}>
            <CirclePause size={15} className="mr-1.5" />
            暂停
          </Button>
          <Button variant="secondary" onClick={() => void resume()} disabled={current.run.status !== 'paused'}>
            <Play size={15} className="mr-1.5" />
            恢复
          </Button>
          <Button variant="secondary" onClick={() => void retry()} disabled={current.run.status !== 'error'}>
            <RotateCcw size={15} className="mr-1.5" />
            重试节点
          </Button>
          <Button variant="secondary" onClick={() => void cancel()} disabled={!['running', 'paused'].includes(current.run.status)}>
            <Square size={15} className="mr-1.5" />
            取消
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[var(--theme-radius-card)] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Checkpoint</div>
          <div className="mt-2 text-sm text-slate-700">{current.run.resumeFromNodeId || '-'}</div>
        </div>
        <div className="rounded-[var(--theme-radius-card)] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Loop Context</div>
          <div className="mt-2 text-sm text-slate-700">
            {loopContext ? `index ${String(loopContext.index ?? '-')}, iteration ${String(loopContext.iteration ?? '-')}` : '-'}
          </div>
          {loopContext?.item !== undefined && (
            <pre className="mt-2 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-100">
              {typeof loopContext.item === 'string' ? loopContext.item : JSON.stringify(loopContext.item, null, 2)}
            </pre>
          )}
        </div>
        <div className="rounded-[var(--theme-radius-card)] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Execution Stack</div>
          <pre className="mt-2 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-100">
            {JSON.stringify(current.run.executionStack || [], null, 2)}
          </pre>
        </div>
      </div>

      <div className="mt-6 space-y-3 overflow-y-auto">
        {Object.values(current.run.nodeRuns).map((nodeRun) => (
          <article key={nodeRun.nodeId} className="rounded-[var(--theme-radius-card)] border border-slate-200 bg-white p-4 shadow-sm">
            <button type="button" className="w-full text-left" onClick={() => inspect(nodeRun)}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <StatusIcon status={nodeRun.status} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{nodeRun.title}</div>
                    <div className="text-xs text-slate-500">{nodeRun.type} · {nodeRun.status}</div>
                  </div>
                </div>
                <div className="text-xs text-slate-400">{formatDate(nodeRun.endedAt || nodeRun.startedAt)}</div>
              </div>
              {nodeRun.checkpoint && (
                <div className="mt-2 text-[11px] text-slate-500">
                  checkpoint: {nodeRun.checkpoint.kind} · {formatDate(nodeRun.checkpoint.savedAt)}
                </div>
              )}
              {nodeRun.error && <div className="mt-3 rounded-[var(--theme-radius-control)] bg-rose-50 px-3 py-2 text-xs text-rose-700">{nodeRun.error}</div>}
              {nodeRun.logs.length > 0 && (
                <pre className="mt-3 max-h-40 overflow-auto rounded-[var(--theme-radius-control)] bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                  {nodeRun.logs.join('')}
                </pre>
              )}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: WorkflowNodeRun['status'] }) {
  if (status === 'success') return <CircleCheck size={16} className="text-emerald-600" />;
  if (status === 'error') return <CircleX size={16} className="text-rose-600" />;
  if (status === 'running') return <Loader2 size={16} className="animate-spin text-amber-600" />;
  if (status === 'paused') return <CirclePause size={16} className="text-sky-600" />;
  return <Circle size={16} className="text-slate-300" />;
}
