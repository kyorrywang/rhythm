import { useEffect, useState } from 'react';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { ORCHESTRATOR_COMMANDS } from '../constants';
import { getRun, listEventsForRun, listTasksForRun } from '../storage';
import type { OrchestratorAgentTask, OrchestratorRun, OrchestratorRunEvent, OrchestratorRunPayload } from '../types';
import { formatDateTime } from '../utils';

export function RunView({ ctx, payload }: WorkbenchProps<OrchestratorRunPayload>) {
  const [run, setRun] = useState<OrchestratorRun>(payload.run);
  const [events, setEvents] = useState<OrchestratorRunEvent[]>([]);
  const [tasks, setTasks] = useState<OrchestratorAgentTask[]>([]);

  useEffect(() => {
    void refresh();
  }, [ctx, payload.run.id]);

  async function refresh() {
    const [latestRun, nextEvents, nextTasks] = await Promise.all([
      getRun(ctx, payload.run.id),
      listEventsForRun(ctx, payload.run.id),
      listTasksForRun(ctx, payload.run.id),
    ]);
    if (latestRun) setRun(latestRun);
    setEvents(nextEvents);
    setTasks(nextTasks);
  }

  return (
    <div className="h-full overflow-auto bg-white px-6 py-5 text-sm text-slate-700">
      <div className="max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{run.goal}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {run.templateName} · {run.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-[var(--theme-radius-control)] bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={run.status === 'pause_requested' || run.status === 'paused'}
              onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.pauseRun, {
                runId: run.id,
              }).then(() => refresh())}
            >
              Pause
            </button>
            <button
              className="rounded-[var(--theme-radius-control)] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={run.status !== 'paused'}
              onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.resumeRun, {
                runId: run.id,
              }).then(() => refresh())}
            >
              Resume
            </button>
            <button
              className="rounded-[var(--theme-radius-control)] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={run.status === 'cancelled' || run.status === 'completed'}
              onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.cancelRun, {
                runId: run.id,
              }).then(() => refresh())}
            >
              Cancel
            </button>
            <button
              className="rounded-[var(--theme-radius-control)] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={run.status === 'pause_requested' || run.status === 'paused'}
              onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.wakeRun, {
                runId: run.id,
                reason: 'user_request',
              }).then(() => refresh())}
            >
              Wake Main Agent
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Current Stage" value={run.currentStageName || '-'} />
          <InfoCard label="Current Agent" value={run.currentAgentName || '-'} />
          <InfoCard label="Source" value={run.source} />
          <InfoCard label="Active Tasks" value={String(run.activeTaskCount)} />
          <InfoCard label="Updated" value={formatDateTime(run.updatedAt)} />
          <InfoCard label="Last Wake" value={formatDateTime(run.lastWakeAt)} />
          <InfoCard label="Last Decision" value={formatDateTime(run.lastDecisionAt)} />
          <InfoCard label="Decision Summary" value={run.lastDecisionSummary || '-'} />
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
          <div className="mt-3 space-y-3">
            {tasks.map((task) => (
              <article key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{task.title}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-slate-400">{task.status}</div>
                    <button
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={task.status === 'completed'}
                      onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.completeTask, {
                        taskId: task.id,
                      }).then(() => refresh())}
                    >
                      Complete
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {task.stageName || '-'} · {task.agentName || '-'}
                </div>
                {task.summary ? <p className="mt-2 text-sm text-slate-600">{task.summary}</p> : null}
              </article>
            ))}
            {tasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                No tasks yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Event Timeline</h2>
          <div className="mt-3 space-y-3">
            {events.map((event) => (
              <article key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{event.title}</div>
                  <div className="text-xs text-slate-400">{formatDateTime(event.createdAt)}</div>
                </div>
                <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{event.type}</div>
                {event.detail ? <p className="mt-2 text-sm text-slate-600">{event.detail}</p> : null}
              </article>
            ))}
            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                No events yet.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 font-medium text-slate-900">{value}</div>
    </div>
  );
}
