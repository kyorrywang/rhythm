import { useEffect, useState } from 'react';
import type { LeftPanelProps } from '../../../../src/plugin/sdk';
import { ORCHESTRATOR_COMMANDS, ORCHESTRATOR_EVENTS, ORCHESTRATOR_VIEWS } from '../constants';
import type { OrchestratorRun, OrchestratorTemplate } from '../types';
import { formatDateTime } from '../utils';

export function OrchestratorPanel({ ctx, width }: LeftPanelProps) {
  const [templates, setTemplates] = useState<OrchestratorTemplate[]>([]);
  const [runs, setRuns] = useState<OrchestratorRun[]>([]);
  const [templateQuery, setTemplateQuery] = useState('');

  function getStatusGroup(status: OrchestratorRun['status']) {
    if (status === 'paused') return 'paused';
    if (status === 'pending' || status === 'running' || status === 'pause_requested') return 'running';
    return 'recent';
  }

  const runningRuns = runs.filter((run) => getStatusGroup(run.status) === 'running');
  const pausedRuns = runs.filter((run) => getStatusGroup(run.status) === 'paused');
  const recentRuns = runs.filter((run) => getStatusGroup(run.status) === 'recent').slice(0, 8);
  const filteredTemplates = templates.filter((template) => {
    const haystack = `${template.name} ${template.domain} ${template.description || ''}`.toLowerCase();
    return haystack.includes(templateQuery.toLowerCase());
  });

  useEffect(() => {
    void refresh();
    const subscriptions = [
      ctx.events.on(ORCHESTRATOR_EVENTS.templatesChanged, () => void refresh()),
      ctx.events.on(ORCHESTRATOR_EVENTS.runsChanged, () => void refresh()),
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.dispose());
    };
  }, [ctx]);

  async function refresh() {
    const [nextTemplates, nextRuns] = await Promise.all([
      ctx.commands.execute<void, OrchestratorTemplate[]>(ORCHESTRATOR_COMMANDS.listTemplates, undefined),
      ctx.commands.execute<void, OrchestratorRun[]>(ORCHESTRATOR_COMMANDS.listRuns, undefined),
    ]);
    setTemplates(nextTemplates);
    setRuns(nextRuns);
  }

  function openTemplate(template: OrchestratorTemplate) {
    ctx.ui.workbench.open({
      id: `orchestrator.template:${template.id}`,
      viewId: ORCHESTRATOR_VIEWS.template,
      title: template.name,
      description: template.domain,
      payload: { template },
      layoutMode: 'replace',
    });
  }

  function openRun(run: OrchestratorRun) {
    ctx.ui.workbench.open({
      id: `orchestrator.run:${run.id}`,
      viewId: ORCHESTRATOR_VIEWS.run,
      title: run.goal,
      description: run.templateName,
      payload: { run },
      layoutMode: 'replace',
    });
  }

  return (
    <div className="h-full overflow-auto bg-[#f8f7f3] px-4 py-5 text-sm text-slate-700" style={{ width }}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Orchestrator</h2>
        <div className="flex gap-2">
          <button
            className="rounded-[var(--theme-radius-control)] border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
            onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.createSampleNovelTemplate, { name: 'Novel Writing Basic' })}
          >
            Sample Novel
          </button>
          <button
            className="rounded-[var(--theme-radius-control)] border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
            onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.createSampleSoftwareTemplate, { name: 'Software Delivery Basic' })}
          >
            Sample Software
          </button>
          <button
            className="rounded-[var(--theme-radius-control)] bg-slate-900 px-3 py-1.5 text-xs text-white"
            onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.createTemplate, { name: 'Untitled Template' })}
          >
            New Template
          </button>
        </div>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Templates</h3>
          <span className="text-xs text-slate-400">{filteredTemplates.length}</span>
        </div>
        <input
          className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
          placeholder="Search templates"
          value={templateQuery}
          onChange={(event) => setTemplateQuery(event.target.value)}
        />
        <div className="space-y-2">
          {filteredTemplates.map((template) => (
            <article
              key={template.id}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition hover:border-slate-300"
            >
              <button className="block w-full text-left" onClick={() => openTemplate(template)}>
                <div className="font-medium text-slate-900">{template.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {template.domain} · v{template.version}
                </div>
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                  onClick={() => openTemplate(template)}
                >
                  Open
                </button>
                <button
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                  onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.duplicateTemplate, {
                    templateId: template.id,
                  })}
                >
                  Duplicate
                </button>
                <button
                  className="rounded border border-rose-300 bg-white px-2 py-1 text-[11px] text-rose-600"
                  onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.deleteTemplate, {
                    templateId: template.id,
                  }).then(() => refresh())}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
          {filteredTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
              No templates yet.
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Running</h3>
          <span className="text-xs text-slate-400">{runningRuns.length}</span>
        </div>
        <div className="space-y-2">
          {runningRuns.map((run) => (
            <RunCard key={run.id} ctx={ctx} run={run} onOpen={openRun} onChanged={() => void refresh()} />
          ))}
          {runningRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
              No running runs.
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paused</h3>
          <span className="text-xs text-slate-400">{pausedRuns.length}</span>
        </div>
        <div className="space-y-2">
          {pausedRuns.map((run) => (
            <RunCard key={run.id} ctx={ctx} run={run} onOpen={openRun} onChanged={() => void refresh()} />
          ))}
          {pausedRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
              No paused runs.
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</h3>
          <span className="text-xs text-slate-400">{recentRuns.length}</span>
        </div>
        <div className="space-y-2">
          {recentRuns.map((run) => (
            <RunCard key={run.id} ctx={ctx} run={run} onOpen={openRun} onChanged={() => void refresh()} compact />
          ))}
          {recentRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
              No recent runs.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function RunCard({
  ctx,
  run,
  onOpen,
  onChanged,
  compact = false,
}: {
  ctx: LeftPanelProps['ctx'];
  run: OrchestratorRun;
  onOpen: (run: OrchestratorRun) => void;
  onChanged: () => void;
  compact?: boolean;
}) {
  return (
    <article
      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition hover:border-slate-300"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(run)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(run);
        }
      }}
    >
      <div className="font-medium text-slate-900">{run.goal}</div>
      <div className="mt-1 text-xs text-slate-500">
        {run.templateName} · {run.status}
      </div>
      {!compact ? (
        <div className="mt-1 text-[11px] text-slate-400">
          {run.currentStageName || '-'} · {run.currentAgentName || '-'} · {run.activeTaskCount} active
        </div>
      ) : null}
      <div className="mt-1 text-[11px] text-slate-400">{formatDateTime(run.updatedAt)}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={(event) => {
            event.stopPropagation();
            void ctx.commands.execute(ORCHESTRATOR_COMMANDS.pauseRun, { runId: run.id }).then(onChanged);
          }}
          disabled={run.status === 'paused' || run.status === 'pause_requested' || run.status === 'cancelled' || run.status === 'completed'}
        >
          Pause
        </button>
        <button
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={(event) => {
            event.stopPropagation();
            void ctx.commands.execute(ORCHESTRATOR_COMMANDS.resumeRun, { runId: run.id }).then(onChanged);
          }}
          disabled={run.status !== 'paused'}
        >
          Resume
        </button>
        <button
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={(event) => {
            event.stopPropagation();
            void ctx.commands.execute(ORCHESTRATOR_COMMANDS.cancelRun, { runId: run.id }).then(onChanged);
          }}
          disabled={run.status === 'cancelled' || run.status === 'completed'}
        >
          Cancel
        </button>
      </div>
    </article>
  );
}
