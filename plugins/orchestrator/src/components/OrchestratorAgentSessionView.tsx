import { useEffect, useState } from 'react';
import { AgentMessage } from '../../../../src/features/session/components/AgentMessage';
import { SystemMessage } from '../../../../src/features/session/components/SystemMessage';
import { UserMessage } from '../../../../src/features/session/components/UserMessage';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { getCoordinatorRun, getRun } from '../storage';
import { ORCHESTRATOR_VIEWS } from '../constants';
import type { OrchestratorCoordinatorRun, OrchestratorCoordinatorRunPayload, OrchestratorRun } from '../types';
import { formatDateTime } from '../utils';
import { useSession, useSessionStore } from '../../../../src/shared/state/useSessionStore';
import { EmptyState } from '../../../../src/shared/ui';

export function OrchestratorAgentSessionView({ ctx, payload }: WorkbenchProps<OrchestratorCoordinatorRunPayload>) {
  const [coordinatorRun, setCoordinatorRun] = useState<OrchestratorCoordinatorRun>(payload.coordinatorRun);
  const [run, setRun] = useState<OrchestratorRun | null>(null);
  const session = useSession(coordinatorRun.sessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  useEffect(() => {
    void refresh();
  }, [payload.coordinatorRun.id]);

  async function refresh() {
    const [latestCoordinatorRun, latestRun] = await Promise.all([
      getCoordinatorRun(ctx, payload.coordinatorRun.id),
      getRun(ctx, payload.coordinatorRun.runId),
    ]);
    if (latestCoordinatorRun) setCoordinatorRun(latestCoordinatorRun);
    if (latestRun) setRun(latestRun);
  }

  return (
    <div className="h-full overflow-auto bg-white px-6 py-5 text-sm text-slate-700">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {run?.sourceSessionId ? (
            <button
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600"
              onClick={() => setActiveSession(run.sourceSessionId!)}
            >
              Back To Conversation
            </button>
          ) : null}
          {run ? (
            <button
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600"
              onClick={() => ctx.ui.workbench.open({
                id: `orchestrator.run:${run.id}`,
                viewId: ORCHESTRATOR_VIEWS.run,
                title: run.goal,
                description: run.planTitle,
                payload: { run },
                layoutMode: 'replace',
              })}
            >
              Back To Run
            </button>
          ) : null}
          <button
            className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600"
            onClick={() => void refresh()}
          >
            Refresh View
          </button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Orchestrator Agent</h1>
            <p className="mt-1 text-sm text-slate-500">
              {run?.planTitle || coordinatorRun.runId} · {coordinatorRun.status}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Wake Reason" value={coordinatorRun.wakeReason || '-'} />
          <InfoCard label="Status" value={coordinatorRun.status} />
          <InfoCard label="Started" value={formatDateTime(coordinatorRun.startedAt)} />
          <InfoCard label="Updated" value={formatDateTime(coordinatorRun.updatedAt)} />
          <InfoCard label="Completed" value={formatDateTime(coordinatorRun.completedAt)} />
          <InfoCard label="Dispatch Count" value={String(coordinatorRun.decision?.dispatchCount || 0)} />
          <InfoCard label="Decision Status" value={coordinatorRun.decision?.status || '-'} />
          <InfoCard label="Run" value={coordinatorRun.runId} />
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Input Snapshot</h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {[
              `Run Goal: ${coordinatorRun.input.runGoal}`,
              `Plan: ${coordinatorRun.input.planTitle}`,
              `Overview: ${coordinatorRun.input.planOverview}`,
              `Wake Reason: ${coordinatorRun.input.wakeReason || '-'}`,
              `Current Stage: ${coordinatorRun.input.currentStageName || '-'}`,
              `Current Stage Target Folder: ${coordinatorRun.input.currentStageTargetFolder || '-'}`,
              `Current Stage Output Files: ${coordinatorRun.input.currentStageOutputFiles.join(' | ') || '-'}`,
              `Active Tasks: ${coordinatorRun.input.activeTaskCount}`,
              `Free Slots: ${coordinatorRun.input.availableSlots}`,
              `Ready Tasks: ${coordinatorRun.input.readyTaskTitles.join(', ') || '-'}`,
              `Blocked Tasks: ${coordinatorRun.input.blockedTaskTitles.join(', ') || '-'}`,
              `Waiting Review: ${coordinatorRun.input.waitingReviewTaskTitles.join(', ') || '-'}`,
              `Latest Reviews: ${coordinatorRun.input.latestReviewSummaries.join(' | ') || '-'}`,
              `Project State: ${coordinatorRun.input.projectStateSummary.join(' | ') || '-'}`,
            ].join('\n\n')}
          </pre>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Prompt</h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {coordinatorRun.prompt}
          </pre>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Decision</h2>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-900">{coordinatorRun.decision?.summary || 'No decision recorded yet.'}</div>
            {coordinatorRun.decision ? (
              <>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <InfoCard label="Current Stage" value={coordinatorRun.decision.currentStageName || '-'} />
                  <InfoCard label="Current Agent" value={coordinatorRun.decision.currentAgentName || '-'} />
                  <InfoCard label="Created" value={formatDateTime(coordinatorRun.decision.createdAt)} />
                </div>
                {coordinatorRun.decision.assignments.length ? (
                  <div className="mt-4 space-y-3">
                    {coordinatorRun.decision.assignments.map((assignment) => (
                      <pre
                        key={assignment.assignmentId}
                        className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700"
                      >
                        {[
                          `Title: ${assignment.title}`,
                          `Why Now: ${assignment.whyNow}`,
                          `Goal: ${assignment.goal}`,
                          `Context: ${assignment.context.join(' | ') || '-'}`,
                          `Instructions: ${assignment.instructions.join(' | ') || '-'}`,
                          `Deliverables: ${assignment.deliverables.join(' | ') || '-'}`,
                          `Target Folder: ${assignment.targetFolder}`,
                          `Expected Files: ${assignment.expectedFiles.join(', ') || '-'}`,
                          `Review Target Paths: ${assignment.reviewTargetPaths.join(', ') || '-'}`,
                          `Review Focus: ${assignment.reviewFocus.join(' | ') || '-'}`,
                          `Risks: ${assignment.risks.join(' | ') || '-'}`,
                        ].join('\n\n')}
                      </pre>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {coordinatorRun.error ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {coordinatorRun.error}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Transcript</h2>
          {!session || session.messages.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No orchestrator transcript yet" description="This orchestrator agent has not produced any session transcript yet." />
            </div>
          ) : (
            <div className="mt-3 space-y-6 pb-8">
              {session.messages.map((msg, index) => (
                msg.role === 'user' ? (
                  <UserMessage key={msg.id || index} message={msg} />
                ) : msg.role === 'system' ? (
                  <SystemMessage key={msg.id || index} message={msg} />
                ) : (
                  <AgentMessage
                    key={msg.id || index}
                    message={msg}
                    sessionId={session.id}
                    isLast={index === session.messages.length - 1}
                    isSessionRunning={!['idle', 'completed', 'failed', 'interrupted'].includes(session.runtime?.state || 'idle')}
                  />
                )
              ))}
            </div>
          )}
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
