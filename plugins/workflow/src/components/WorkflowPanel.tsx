import { useCallback, useEffect, useState } from 'react';
import { Play, Plus } from 'lucide-react';
import type { LeftPanelProps } from '../../../../src/plugin/sdk';
import { themeRecipes } from '../../../../src/shared/theme/recipes';
import { Button } from '../../../../src/shared/ui/Button';
import { SidebarPage } from '../../../../src/shared/ui/SidebarPage';
import { WORKFLOW_COMMANDS, WORKFLOW_EVENTS, WORKFLOW_VIEWS } from '../constants';
import { listRuns, listWorkflows } from '../storage';
import type { WorkflowDefinition, WorkflowRun } from '../types';
import { formatDate } from '../utils';

export function WorkflowPanel({ ctx, width }: LeftPanelProps) {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextWorkflows, nextRuns] = await Promise.all([listWorkflows(ctx), listRuns(ctx)]);
      setWorkflows(nextWorkflows);
      setRuns(nextRuns);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '加载工作流失败'));
    } finally {
      setIsLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const changed = ctx.events.on(WORKFLOW_EVENTS.changed, () => {
      void refresh();
    });
    const runUpdated = ctx.events.on(WORKFLOW_EVENTS.runUpdated, () => {
      void refresh();
    });
    return () => {
      changed.dispose();
      runUpdated.dispose();
    };
  }, [ctx.events, refresh]);

  const createWorkflow = async () => {
    const name = window.prompt('工作流名称', 'Untitled Workflow');
    if (name === null) return;
    try {
      await ctx.commands.execute(WORKFLOW_COMMANDS.create, { name: name.trim() || 'Untitled Workflow' });
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '创建工作流失败'));
    }
  };

  const openEditor = (workflow: WorkflowDefinition) => {
    ctx.ui.workbench.open({
      viewId: WORKFLOW_VIEWS.editor,
      title: workflow.name,
      description: `${workflow.nodes.length} node(s)`,
      payload: { workflow },
      layoutMode: 'replace',
    });
  };

  const runWorkflow = async (workflow: WorkflowDefinition) => {
    try {
      await ctx.commands.execute(WORKFLOW_COMMANDS.run, { workflowId: workflow.id });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error || '运行工作流失败'));
    }
  };

  return (
    <SidebarPage width={width}>
      <div className="px-4 pb-3 pt-5">
        <div className={`text-[11px] uppercase tracking-[0.18em] ${themeRecipes.eyebrow()}`}>Workflow</div>
        <Button
          variant="primary"
          size="md"
          onClick={() => void createWorkflow()}
          className="mt-3 flex w-full items-center justify-center gap-[var(--theme-toolbar-gap)]"
        >
          <Plus size={14} opacity={0.7} />
          新建工作流
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-5">
        {error && (
          <div className="rounded-[var(--theme-radius-card)] border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
            {error}
          </div>
        )}

        <section>
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Definitions</div>
          {isLoading && <div className="rounded-[var(--theme-radius-card)] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">正在加载...</div>}
          <div className="space-y-2">
            {workflows.map((workflow) => (
              <article key={workflow.id} className="rounded-[var(--theme-radius-card)] border border-slate-200 bg-white p-3 shadow-sm">
                <button
                  type="button"
                  onClick={() => openEditor(workflow)}
                  className="block w-full text-left"
                >
                  <div className="text-sm font-semibold text-slate-900">{workflow.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {workflow.nodes.length} node(s), updated {formatDate(workflow.updatedAt)}
                  </div>
                </button>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openEditor(workflow)}>编辑</Button>
                  <Button variant="primary" size="sm" onClick={() => void runWorkflow(workflow)}>
                    <Play size={13} className="mr-1.5" />
                    运行
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!isLoading && workflows.length === 0 && (
            <div className="rounded-[var(--theme-radius-card)] border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              还没有工作流
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">Recent Runs</div>
          <div className="space-y-2">
            {runs.slice(0, 5).map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => {
                  const workflow = workflows.find((item) => item.id === run.workflowId);
                  if (workflow) {
                    ctx.ui.workbench.open({
                      id: `workflow.run:${run.id}`,
                      viewId: WORKFLOW_VIEWS.run,
                      title: `Run: ${workflow.name}`,
                      description: `Status: ${run.status}`,
                      payload: { workflow, run },
                      layoutMode: 'replace',
                    });
                  }
                }}
                className="w-full rounded-[var(--theme-radius-card)] border border-slate-200 bg-white px-3 py-3 text-left shadow-sm hover:border-amber-200"
              >
                <div className="text-sm font-medium text-slate-800">{run.workflowName}</div>
                <div className="mt-1 text-xs text-slate-500">{run.status} · {formatDate(run.startedAt)}</div>
              </button>
            ))}
          </div>
          {runs.length === 0 && <div className="text-sm text-slate-500">暂无运行记录</div>}
        </section>
      </div>
    </SidebarPage>
  );
}
