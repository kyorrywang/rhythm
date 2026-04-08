import { useEffect, useState } from 'react';
import { Circle, CircleCheck, CircleX, Loader2, Square } from 'lucide-react';
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

  const cancel = async () => {
    try {
      await ctx.commands.execute(WORKFLOW_COMMANDS.cancel, { runId: current.run.id });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '取消失败'));
    }
  };

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
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
        <Button
          variant="secondary"
          onClick={() => void cancel()}
          disabled={current.run.status !== 'running'}
          className="rounded-xl"
        >
          <Square size={15} className="mr-1.5" />
          取消
        </Button>
      </div>

      <div className="mt-6 space-y-3 overflow-y-auto">
        {Object.values(current.run.nodeRuns).map((nodeRun) => (
          <article key={nodeRun.nodeId} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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
              {nodeRun.error && <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{nodeRun.error}</div>}
              {nodeRun.logs.length > 0 && (
                <pre className="mt-3 max-h-40 overflow-auto rounded-2xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
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
  return <Circle size={16} className="text-slate-300" />;
}
