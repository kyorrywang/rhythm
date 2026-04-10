import { useEffect, useMemo, useState } from 'react';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { ORCHESTRATOR_COMMANDS, ORCHESTRATOR_EVENTS, ORCHESTRATOR_VIEWS } from '../constants';
import { getProjectState, getRun, listAgentRunsForRun, listArtifactsForRun, listCoordinatorRunsForRun, listEventsForRun, listReviewLogsForRun, listTasksForRun } from '../storage';
import type { OrchestratorAgentRun, OrchestratorAgentTask, OrchestratorArtifact, OrchestratorCoordinatorRun, OrchestratorProjectState, OrchestratorReviewLog, OrchestratorRun, OrchestratorRunEvent, OrchestratorRunPayload } from '../types';
import { formatDateTime } from '../utils';
import { useSessionStore } from '../../../../src/shared/state/useSessionStore';
import { useWorkbenchHeaderCenter } from '../../../../src/features/workbench/WorkbenchHeaderCenterContext';

export function RunView({ ctx, payload }: WorkbenchProps<OrchestratorRunPayload>) {
  const [run, setRun] = useState<OrchestratorRun>(payload.run);
  const [events, setEvents] = useState<OrchestratorRunEvent[]>([]);
  const [tasks, setTasks] = useState<OrchestratorAgentTask[]>([]);
  const [agentRuns, setAgentRuns] = useState<OrchestratorAgentRun[]>([]);
  const [artifacts, setArtifacts] = useState<OrchestratorArtifact[]>([]);
  const [coordinatorRuns, setCoordinatorRuns] = useState<OrchestratorCoordinatorRun[]>([]);
  const [reviewLogs, setReviewLogs] = useState<OrchestratorReviewLog[]>([]);
  const [projectState, setProjectState] = useState<OrchestratorProjectState | null>(null);
  const [topTab, setTopTab] = useState<'plan' | 'execution' | 'artifacts' | 'events'>('execution');
  const [now, setNow] = useState(() => Date.now());
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const headerCenter = useWorkbenchHeaderCenter();

  useEffect(() => {
    void refresh();
    const subscription = ctx.events.on(ORCHESTRATOR_EVENTS.runsChanged, (event) => {
      const runId = (event as { runId?: string } | undefined)?.runId;
      if (!runId || runId === payload.run.id) {
        void refresh();
      }
    });
    return () => {
      subscription.dispose();
    };
  }, [ctx, payload.run.id]);

  const headerTabs = useMemo(() => (
    <div
      role="radiogroup"
      aria-label="Run sections"
      className="inline-flex items-center rounded-[var(--theme-radius-control)] border border-slate-300 bg-white p-1"
    >
      {([
        { key: 'plan', label: 'Plan' },
        { key: 'execution', label: '执行过程' },
        { key: 'artifacts', label: 'Artifacts' },
        { key: 'events', label: 'Event Timeline' },
      ] as const).map((item) => (
        <label
          key={item.key}
          className={`cursor-pointer rounded-[calc(var(--theme-radius-control)-4px)] px-3 py-1.5 text-xs font-medium transition ${
            topTab === item.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <input
            type="radio"
            name="orchestrator-run-sections"
            className="sr-only"
            checked={topTab === item.key}
            onChange={() => setTopTab(item.key)}
          />
          {item.label}
        </label>
      ))}
    </div>
  ), [topTab]);

  useEffect(() => {
    headerCenter?.setHeaderCenterContent(headerTabs);
    return () => {
      headerCenter?.setHeaderCenterContent(null);
    };
  }, [headerCenter, headerTabs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  async function refresh() {
    const [latestRun, nextEvents, nextTasks, nextAgentRuns, nextArtifacts, nextReviewLogs, nextProjectState, nextCoordinatorRuns] = await Promise.all([
      getRun(ctx, payload.run.id),
      listEventsForRun(ctx, payload.run.id),
      listTasksForRun(ctx, payload.run.id),
      listAgentRunsForRun(ctx, payload.run.id),
      listArtifactsForRun(ctx, payload.run.id),
      listReviewLogsForRun(ctx, payload.run.id),
      getProjectState(ctx, payload.run.id),
      listCoordinatorRunsForRun(ctx, payload.run.id),
    ]);
    if (latestRun) setRun(latestRun);
    setEvents(nextEvents);
    setTasks(nextTasks);
    setAgentRuns(nextAgentRuns);
    setArtifacts(nextArtifacts);
    setReviewLogs(nextReviewLogs);
    setProjectState(nextProjectState);
    setCoordinatorRuns(nextCoordinatorRuns);
  }

  async function updateTaskSummary(task: OrchestratorAgentTask) {
    const nextSummary = window.prompt('Update the task instruction for this agent.', task.summary || '');
    if (nextSummary === null) return;
    await ctx.commands.execute(ORCHESTRATOR_COMMANDS.updateTask, {
      taskId: task.id,
      summary: nextSummary,
    });
    await refresh();
  }

  async function retryTask(task: OrchestratorAgentTask) {
    await ctx.commands.execute(ORCHESTRATOR_COMMANDS.retryTask, {
      taskId: task.id,
    });
    await refresh();
  }

  async function skipTask(task: OrchestratorAgentTask) {
    await ctx.commands.execute(ORCHESTRATOR_COMMANDS.skipTask, {
      taskId: task.id,
    });
    await refresh();
  }

  const showPlan = topTab === 'plan';
  const showExecution = topTab === 'execution';
  const showArtifacts = topTab === 'artifacts';
  const showEvents = topTab === 'events';
  const acceptedArtifacts = artifacts.filter((artifact) => artifact.status === 'accepted');
  const nonAcceptedArtifacts = artifacts.filter((artifact) => artifact.status !== 'accepted');
  const waitingHumanTasks = tasks.filter((task) => task.status === 'waiting_human');
  const failedTasks = tasks.filter((task) => task.status === 'failed');
  const checkpointTasks = tasks.filter((task) => task.nodeType === 'checkpoint');
  const autoRetryAt = run.failureState?.autoRetryAt ?? null;
  const autoRetryCountdownSeconds = autoRetryAt ? Math.max(0, Math.ceil((autoRetryAt - now) / 1000)) : null;
  const autoRetryPending = Boolean(
    run.failureState?.retryable
    && !run.failureState?.requiresHuman
    && autoRetryAt
    && autoRetryCountdownSeconds !== null
    && autoRetryCountdownSeconds > 0,
  );

  return (
    <div className="h-full overflow-auto bg-white px-6 py-5 text-sm text-slate-700">
      <div className="max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {run.sourceSessionId ? (
            <button
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600"
              onClick={() => setActiveSession(run.sourceSessionId!)}
            >
              Back To Conversation
            </button>
          ) : null}
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
            Refresh View
          </button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{run.goal}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {run.planTitle} · {run.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-[var(--theme-radius-control)] bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={run.status === 'pause_requested' || run.status === 'paused' || run.status === 'waiting_human'}
              onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.pauseRun, {
                runId: run.id,
              }).then(() => refresh())}
            >
              Pause
            </button>
            <button
              className="rounded-[var(--theme-radius-control)] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!['paused', 'waiting_human'].includes(run.status)}
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
              disabled={['pause_requested', 'paused', 'waiting_human', 'failed', 'completed', 'cancelled'].includes(run.status)}
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
          <InfoCard label="Concurrency Limit" value={String(run.maxConcurrentTasks || 2)} />
          <InfoCard label="Watchdog" value={run.watchdogStatus || 'healthy'} />
          <InfoCard label="Updated" value={formatDateTime(run.updatedAt)} />
          <InfoCard label="Last Wake" value={formatDateTime(run.lastWakeAt)} />
          <InfoCard label="Wake Reason" value={run.lastWakeReason || '-'} />
          <InfoCard label="Last Decision" value={formatDateTime(run.lastDecisionAt)} />
          <InfoCard label="Decision Summary" value={run.lastDecisionSummary || '-'} />
          <InfoCard label="Human Checkpoint" value={run.pendingHumanCheckpoint || '-'} />
          <InfoCard label="Failure Kind" value={run.failureState?.kind || '-'} />
          <InfoCard label="Recommended Action" value={run.failureState?.recommendedAction || '-'} />
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-slate-900">Engine Health</div>
            <div className={`text-xs uppercase tracking-wide ${engineToneClass(run, tasks)}`}>{deriveEngineStateLabel(run, tasks)}</div>
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-700">
            {run.engineHealthSummary || deriveEngineHealthSummary(run, tasks, agentRuns, reviewLogs)}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Blocked Tasks" value={String(tasks.filter((task) => task.status === 'blocked').length)} />
            <InfoCard label="Waiting Review" value={String(tasks.filter((task) => task.status === 'waiting_review').length)} />
            <InfoCard label="Waiting Human" value={String(tasks.filter((task) => task.status === 'waiting_human').length)} />
            <InfoCard label="Running Sessions" value={String(agentRuns.filter((agentRun) => ['ready', 'pending', 'running'].includes(agentRun.status)).length)} />
          </div>
          {run.lastHumanInterventionAt ? (
            <div className="mt-3 text-xs text-slate-500">
              Last human intervention: {formatDateTime(run.lastHumanInterventionAt)}
            </div>
          ) : null}
          {autoRetryPending ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
              Automatic retry scheduled in {autoRetryCountdownSeconds}s for task {run.failureState?.taskId || '-'}.
            </div>
          ) : null}
        </section>

        {run.watchdogWarning ? (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-medium">Watchdog Warning</div>
            <div className="mt-1">{run.watchdogWarning}</div>
            <div className="mt-2 text-xs text-amber-700">
              Last checked: {formatDateTime(run.watchdogCheckedAt)}
            </div>
          </section>
        ) : null}

        {run.failureState ? (
          <section className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Failure State</div>
              <div className="text-xs uppercase tracking-wide">{run.failureState.kind}</div>
            </div>
            <div className="mt-2">{run.failureState.summary}</div>
            {autoRetryPending ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-3 text-sm text-emerald-900">
                This failure is being retried automatically in {autoRetryCountdownSeconds}s.
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard label="Retryable" value={run.failureState.retryable ? 'yes' : 'no'} />
              <InfoCard label="Requires Human" value={run.failureState.requiresHuman ? 'yes' : 'no'} />
              <InfoCard label="First Seen" value={formatDateTime(run.failureState.firstOccurredAt)} />
              <InfoCard label="Retry Count" value={String(run.failureState.retryCount)} />
              <InfoCard label="Auto Retry At" value={formatDateTime(autoRetryAt)} />
              <InfoCard label="Retry In" value={autoRetryPending ? `${autoRetryCountdownSeconds}s` : (autoRetryAt ? 'due now' : '-')} />
            </div>
            <div className="mt-3 rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm text-rose-900">
              {run.failureState.recommendedAction}
            </div>
          </section>
        ) : null}

        {(run.status === 'waiting_human' || checkpointTasks.length > 0) ? (
          <section className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <div className="font-medium">Human Handoff</div>
            <div className="mt-2">{run.pendingHumanCheckpoint || 'This run is waiting for explicit human action before it can continue.'}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <InfoCard label="Waiting Tasks" value={String(waitingHumanTasks.length)} />
              <InfoCard label="Checkpoints" value={String(checkpointTasks.length)} />
              <InfoCard label="Failed Tasks" value={String(failedTasks.length)} />
            </div>
          </section>
        ) : null}

        {showPlan ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Confirmed Plan</h2>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-900">{run.confirmedPlan.title}</div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{run.confirmedPlan.overview}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <StringListBlock label="Constraints" values={run.confirmedPlan.constraints} emptyLabel="No constraints." />
              <StringListBlock label="Success Criteria" values={run.confirmedPlan.successCriteria} emptyLabel="No success criteria." />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <StringListBlock label="Decomposition Principles" values={run.confirmedPlan.decompositionPrinciples} emptyLabel="No decomposition principles." />
              <StringListBlock label="Human Checkpoints" values={run.confirmedPlan.humanCheckpoints} emptyLabel="No human checkpoints." />
              <StringListBlock label="Review Checkpoints" values={run.confirmedPlan.reviewCheckpoints} emptyLabel="No review checkpoints." />
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review Policy</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {run.confirmedPlan.reviewPolicy || 'No review policy defined.'}
              </p>
            </div>
          </div>
        </section>
        ) : null}

        {showPlan ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Plan Stages</h2>
          <div className="mt-3 space-y-3">
            {run.confirmedPlan.stages.map((stage, index) => (
              <article key={stage.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{index + 1}. {stage.name}</div>
                  <div className="text-xs text-slate-400">Work {'->'} Review</div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{stage.goal}</p>
                <div className="mt-3">
                  <StringListBlock label="Deliverables" values={stage.deliverables} emptyLabel="No deliverables defined." />
                </div>
              </article>
            ))}
          </div>
        </section>
        ) : null}

        {showExecution ? (
        <>
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Orchestration Agent</h2>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard label="Coordinator Runs" value={String(coordinatorRuns.length)} />
              <InfoCard label="Wake Reason" value={run.orchestrationInput?.wakeReason || run.lastWakeReason || '-'} />
              <InfoCard label="Decision Status" value={run.orchestrationDecision?.status || '-'} />
              <InfoCard label="Dispatch Count" value={String(run.orchestrationDecision?.dispatchCount || 0)} />
              <InfoCard label="Decision Time" value={formatDateTime(run.orchestrationDecision?.createdAt)} />
              <InfoCard label="Stage Id" value={run.orchestrationDecision?.currentStageId || '-'} />
              <InfoCard label="Agent Id" value={run.orchestrationDecision?.currentAgentId || '-'} />
              <InfoCard label="Allowed Dispatches" value={run.orchestrationDecision?.allowedDispatchKinds.join(', ') || '-'} />
              <InfoCard label="Selected Parents" value={run.orchestrationDecision?.selectedParentTaskIds.join(', ') || '-'} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <DetailPanel
                label="Input Snapshot"
                content={[
                  `Run Goal: ${run.orchestrationInput?.runGoal || run.goal}`,
                  `Plan: ${run.orchestrationInput?.planTitle || run.planTitle}`,
                  `Overview: ${run.orchestrationInput?.planOverview || run.confirmedPlan.overview}`,
                  `Decomposition: ${run.orchestrationInput?.decompositionPrinciples.join(' | ') || run.confirmedPlan.decompositionPrinciples.join(' | ') || '-'}`,
                  `Human Checkpoints: ${run.orchestrationInput?.humanCheckpoints.join(' | ') || run.confirmedPlan.humanCheckpoints.join(' | ') || '-'}`,
                  `Review Checkpoints: ${run.orchestrationInput?.reviewCheckpoints.join(' | ') || run.confirmedPlan.reviewCheckpoints.join(' | ') || '-'}`,
                  `Ready Tasks: ${run.orchestrationInput?.readyTaskTitles.join(', ') || '-'}`,
                  `Blocked Tasks: ${run.orchestrationInput?.blockedTaskTitles.join(', ') || '-'}`,
                  `Waiting Review: ${run.orchestrationInput?.waitingReviewTaskTitles.join(', ') || '-'}`,
                  `Actionable Tasks: ${run.orchestrationInput?.actionableTasks.join(' | ') || '-'}`,
                  `Latest Reviews: ${run.orchestrationInput?.latestReviewSummaries.join(' | ') || '-'}`,
                  `Project State: ${run.orchestrationInput?.projectStateSummary.join(' | ') || '-'}`,
                  `Candidate Dispatches: ${run.orchestrationInput?.candidateDispatches.join(' || ') || '-'}`,
                ].join('\n\n')}
              />
              <DetailPanel
                label="Prompt And Decision"
                content={[
                  `Summary: ${run.orchestrationDecision?.summary || run.lastDecisionSummary || '-'}`,
                  `Allowed Dispatch Kinds: ${run.orchestrationDecision?.allowedDispatchKinds.join(', ') || '-'}`,
                  `Candidate Dispatches: ${run.orchestrationDecision?.candidateDispatches.join(' || ') || '-'}`,
                  `Dispatches: ${run.orchestrationDecision?.dispatchTitles.join(', ') || '-'}`,
                  `Assignments: ${run.orchestrationDecision?.assignmentTitles.join(', ') || '-'}`,
                  `Task Operation Types: ${run.orchestrationDecision?.taskOperationTypes.join(', ') || '-'}`,
                  `Task Operations: ${run.orchestrationDecision?.taskOperationSummaries.join(' | ') || '-'}`,
                  '',
                  run.orchestrationPrompt || 'No orchestration prompt recorded yet.',
                ].join('\n')}
              />
            </div>
            {run.orchestrationDecision?.assignments.length ? (
              <div className="mt-4 space-y-3">
                {run.orchestrationDecision.assignments.map((assignment) => (
                  <DetailPanel
                    key={assignment.assignmentId}
                    label={`Assignment · ${assignment.title}`}
                    content={[
                      `Why Now: ${assignment.whyNow}`,
                      `Goal: ${assignment.goal}`,
                      assignment.context.length ? `Context:\n- ${assignment.context.join('\n- ')}` : 'Context: -',
                      assignment.inputArtifacts.length ? `Input Artifacts:\n- ${assignment.inputArtifacts.join('\n- ')}` : 'Input Artifacts: -',
                      assignment.instructions.length ? `Instructions:\n- ${assignment.instructions.join('\n- ')}` : 'Instructions: -',
                      assignment.acceptanceCriteria.length ? `Acceptance Criteria:\n- ${assignment.acceptanceCriteria.join('\n- ')}` : 'Acceptance Criteria: -',
                      assignment.deliverables.length ? `Deliverables:\n- ${assignment.deliverables.join('\n- ')}` : 'Deliverables: -',
                      assignment.reviewFocus.length ? `Review Focus:\n- ${assignment.reviewFocus.join('\n- ')}` : 'Review Focus: -',
                      assignment.risks.length ? `Risks:\n- ${assignment.risks.join('\n- ')}` : 'Risks: -',
                    ].join('\n\n')}
                  />
                ))}
              </div>
            ) : null}
            {coordinatorRuns.length ? (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Orchestrator Sessions</div>
                <div className="mt-2 space-y-2">
                  {coordinatorRuns.slice(-3).reverse().map((item) => (
                    <button
                      key={item.id}
                      className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700"
                      onClick={() => ctx.ui.workbench.open({
                        id: `orchestrator.orchestrator-agent-run:${item.id}`,
                        viewId: ORCHESTRATOR_VIEWS.orchestratorAgentRun,
                        title: item.title,
                        description: item.wakeReason || item.status,
                        payload: { coordinatorRun: item },
                        layoutMode: 'replace',
                      })}
                    >
                      {item.title} · {item.status} · {formatDateTime(item.updatedAt)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {run.currentOrchestratorAgentRunId ? (
              <div className="mt-4">
                <button
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                  onClick={() => {
                    const current = coordinatorRuns.find((item) => item.id === run.currentOrchestratorAgentRunId);
                    if (!current) return;
                    ctx.ui.workbench.open({
                      id: `orchestrator.orchestrator-agent-run:${current.id}`,
                      viewId: ORCHESTRATOR_VIEWS.orchestratorAgentRun,
                      title: current.title,
                      description: current.wakeReason || current.status,
                      payload: { coordinatorRun: current },
                      layoutMode: 'replace',
                    });
                  }}
                >
                  Open Current Orchestrator Agent
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Execution Graph</h2>
          <div className="mt-3 space-y-4">
            {groupTasksByStage(tasks, agentRuns, artifacts).map((group) => (
              <article key={group.stageId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{group.stageName}</div>
                    <div className="mt-1 text-xs text-slate-500">{group.tasks.length} task(s)</div>
                  </div>
                  <div className="text-xs text-slate-400">{group.tasks.map((task) => task.status).join(' · ')}</div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {group.tasks.map((task) => {
                    const agentRun = group.agentRuns.find((item) => item.taskId === task.id) || null;
                    const taskArtifacts = group.artifacts.filter((artifact) => artifact.taskId === task.id);
                    return (
                      <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-slate-900">{task.agentName || task.title}</div>
                          <div className="text-xs text-slate-400">{task.status}</div>
                        </div>
                        {agentRun ? (
                          <button
                            className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                            onClick={() => ctx.ui.workbench.open({
                              id: `orchestrator.agent-run:${agentRun.id}`,
                              viewId: ORCHESTRATOR_VIEWS.agentRun,
                              title: agentRun.title,
                              description: agentRun.stageName,
                              payload: { agentRun },
                              layoutMode: 'replace',
                            })}
                          >
                            Open Agent Session
                          </button>
                        ) : null}
                        {taskArtifacts.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {taskArtifacts.map((artifact) => (
                              <div key={artifact.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{artifact.kind} · {artifact.status}</div>
                                <div className="mt-1 text-sm text-slate-700">{artifact.name}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-slate-400">No artifacts yet.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Review Log</h2>
          <div className="mt-3 space-y-3">
            {reviewLogs.map((log) => (
              <article key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{log.stageName || log.reviewerName || 'Review'}</div>
                  <div className={`text-xs uppercase tracking-wide ${reviewToneClass(log.decision)}`}>{log.decision}</div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {log.reviewerName || '-'} · {formatDateTime(log.createdAt)}
                </div>
                <p className="mt-2 text-sm text-slate-700">{log.summary}</p>
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700">{log.feedback}</pre>
              </article>
            ))}
            {reviewLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                No review decisions yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Task Tree</h2>
          <div className="mt-3 space-y-3">
            {buildTaskRows(tasks).map((task) => {
              const agentRun = agentRuns.find((item) => item.taskId === task.id) || null;
              return (
              <article key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2" style={{ paddingLeft: `${task.depth * 18}px` }}>
                    <span className="text-xs uppercase tracking-wide text-slate-400">{task.nodeType}</span>
                    <div className="font-medium text-slate-900">{task.title}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-slate-400">{task.status}</div>
                    {task.nodeType !== 'container' && agentRun ? (
                      <button
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                        onClick={() => ctx.ui.workbench.open({
                          id: `orchestrator.agent-run:${agentRun.id}`,
                          viewId: ORCHESTRATOR_VIEWS.agentRun,
                          title: agentRun.title,
                          description: agentRun.stageName,
                          payload: { agentRun },
                          layoutMode: 'replace',
                        })}
                      >
                        Open Session
                      </button>
                    ) : null}
                    <button
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={task.nodeType === 'container' || task.status === 'completed'}
                      onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.completeTask, {
                        taskId: task.id,
                      }).then(() => refresh())}
                    >
                      Complete
                    </button>
                    <button
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                      disabled={task.nodeType === 'container'}
                      onClick={() => void updateTaskSummary(task)}
                    >
                      Edit Task
                    </button>
                    <button
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={task.nodeType === 'container' || !['failed', 'paused', 'cancelled', 'waiting_human', 'blocked'].includes(task.status)}
                      title={getRetryDisabledReason(task)}
                      onClick={() => void retryTask(task)}
                    >
                      Retry
                    </button>
                    <button
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={task.nodeType === 'container' || ['completed', 'cancelled'].includes(task.status)}
                      onClick={() => void skipTask(task)}
                    >
                      Skip
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {task.stageName || '-'} · {task.agentName || '-'} · attempts {task.attemptCount} · priority {task.priority ?? task.order}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {task.nodeType === 'container' ? `container · review ${task.reviewRequired ? 'required' : 'optional'}` : `${task.kind || task.nodeType}`}
                </div>
                {task.sessionId ? (
                  <div className="mt-1 break-all text-[11px] text-slate-400">session: {task.sessionId}</div>
                ) : null}
                {task.summary ? <p className="mt-2 text-sm text-slate-600">{task.summary}</p> : null}
                {task.objective ? <p className="mt-2 text-xs text-slate-500">Objective: {task.objective}</p> : null}
                {task.inputs?.length ? <p className="mt-2 text-xs text-slate-500">Inputs: {task.inputs.join(', ')}</p> : null}
                {task.expectedOutputs?.length ? <p className="mt-2 text-xs text-slate-500">Expected Outputs: {task.expectedOutputs.join(', ')}</p> : null}
                {task.latestArtifactIds?.length ? <p className="mt-2 text-xs text-slate-500">Latest Artifacts: {task.latestArtifactIds.join(', ')}</p> : null}
                {task.latestReviewLogId ? <p className="mt-2 text-xs text-slate-500">Latest Review Log: {task.latestReviewLogId}</p> : null}
                {task.targetFolder ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Target: {task.targetFolder}{task.expectedFiles?.length ? ` -> ${task.expectedFiles.join(', ')}` : ''}
                  </p>
                ) : null}
                {task.dependencyTaskIds?.length ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Depends on: {task.dependencyTaskIds.join(', ')}
                  </p>
                ) : null}
                {task.requiresHumanApproval ? (
                  <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    Human approval required before dispatch.
                  </p>
                ) : null}
                {task.blockedReason ? (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Blocked reason: {task.blockedReason}
                  </p>
                ) : null}
              </article>
            );
            })}
            {tasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                No tasks yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Project State</h2>
          <div className="mt-3 space-y-3">
            {projectState?.entries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{entry.label}</div>
                  <div className="text-xs uppercase tracking-wide text-emerald-600">{entry.artifactKind}</div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {entry.logicalKey} · {entry.stageName || '-'} · {formatDateTime(entry.updatedAt)}
                </div>
                <p className="mt-2 text-sm text-slate-700">{entry.summary}</p>
              </article>
            ))}
            {!projectState || projectState.entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                No accepted project state yet.
              </div>
            ) : null}
            {projectState?.structureSummary?.length ? (
              <DetailPanel label="Structure Summary" content={projectState.structureSummary.join('\n')} />
            ) : null}
            {projectState?.dependencySummary?.length ? (
              <DetailPanel label="Dependency Summary" content={projectState.dependencySummary.join('\n')} />
            ) : null}
          </div>
        </section>

        </>
        ) : null}

        {showArtifacts ? (
        <>
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Accepted Artifacts</h2>
          <div className="mt-3 space-y-3">
            {acceptedArtifacts.map((artifact) => (
              <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{artifact.name}</div>
                  <div className="text-xs uppercase tracking-wide text-emerald-600">{artifact.kind} · {artifact.status}</div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {artifact.logicalKey} · {artifact.stageName || '-'} · {artifact.agentName || '-'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  v{artifact.version} · {artifact.summary}
                </div>
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700">{artifact.content}</pre>
              </article>
            ))}
            {acceptedArtifacts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                No accepted artifacts yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">Non-Accepted Artifacts</h2>
          <div className="mt-3 space-y-3">
            {nonAcceptedArtifacts.map((artifact) => (
              <article key={artifact.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{artifact.name}</div>
                  <div className={`text-xs uppercase tracking-wide ${artifactToneClass(artifact.status)}`}>
                    {artifact.kind} · {artifact.status}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {artifact.logicalKey} · {artifact.stageName || '-'} · {artifact.agentName || '-'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  v{artifact.version} · {artifact.summary}
                </div>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700">{artifact.content}</pre>
              </article>
            ))}
            {nonAcceptedArtifacts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">
                No non-accepted artifacts.
              </div>
            ) : null}
          </div>
        </section>
        </>
        ) : null}

        {showEvents ? (
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
        ) : null}
      </div>
    </div>
  );
}

function groupTasksByStage(
  tasks: OrchestratorAgentTask[],
  agentRuns: OrchestratorAgentRun[],
  artifacts: OrchestratorArtifact[],
) {
  const map = new Map<string, {
    stageId: string;
    stageName: string;
    tasks: OrchestratorAgentTask[];
    agentRuns: OrchestratorAgentRun[];
    artifacts: OrchestratorArtifact[];
  }>();

  for (const task of tasks) {
    if (task.nodeType === 'container') continue;
    const stageId = task.stageId || 'unknown-stage';
    const current = map.get(stageId) || {
      stageId,
      stageName: task.stageName || 'Unknown Stage',
      tasks: [],
      agentRuns: [],
      artifacts: [],
    };
    current.tasks.push(task);
    map.set(stageId, current);
  }

  for (const agentRun of agentRuns) {
    const stageId = agentRun.stageId || 'unknown-stage';
    const current = map.get(stageId);
    if (current) current.agentRuns.push(agentRun);
  }

  for (const artifact of artifacts) {
    const stageId = artifact.stageId || 'unknown-stage';
    const current = map.get(stageId);
    if (current) current.artifacts.push(artifact);
  }

  return Array.from(map.values());
}

function buildTaskRows(tasks: OrchestratorAgentTask[]) {
  const byParent = new Map<string, OrchestratorAgentTask[]>();
  const roots: OrchestratorAgentTask[] = [];

  for (const task of tasks) {
    if (task.parentTaskId) {
      const current = byParent.get(task.parentTaskId) || [];
      current.push(task);
      byParent.set(task.parentTaskId, current);
    } else {
      roots.push(task);
    }
  }

  const orderedRoots = [...roots].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const rows: OrchestratorAgentTask[] = [];

  function visit(task: OrchestratorAgentTask) {
    rows.push(task);
    const children = [...(byParent.get(task.id) || [])].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    for (const child of children) visit(child);
  }

  for (const root of orderedRoots) visit(root);
  return rows;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 font-medium text-slate-900">{value}</div>
    </div>
  );
}

function DetailPanel({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{content}</pre>
    </div>
  );
}

function getRetryDisabledReason(task: OrchestratorAgentTask) {
  if (task.nodeType === 'container') {
    return 'Container tasks cannot be retried directly.';
  }
  if (['failed', 'paused', 'cancelled', 'waiting_human', 'blocked'].includes(task.status)) {
    return 'Retry this task.';
  }
  if (task.status === 'running' || task.status === 'ready') {
    return 'This task is still running.';
  }
  if (task.status === 'waiting_review') {
    return 'This task is waiting for review before it can be retried.';
  }
  if (task.status === 'completed') {
    return 'Completed tasks do not need retry.';
  }
  return `Retry is unavailable while the task is ${task.status}.`;
}

function reviewToneClass(decision: OrchestratorReviewLog['decision']) {
  if (decision === 'approved') return 'text-emerald-600';
  if (decision === 'needs_changes') return 'text-amber-600';
  return 'text-rose-600';
}

function artifactToneClass(status: OrchestratorArtifact['status']) {
  if (status === 'accepted') return 'text-emerald-600';
  if (status === 'draft' || status === 'review_submitted') return 'text-amber-600';
  if (status === 'rejected') return 'text-rose-600';
  return 'text-slate-400';
}

function deriveEngineStateLabel(run: OrchestratorRun, tasks: OrchestratorAgentTask[]) {
  if (run.watchdogStatus === 'stalled') return 'stalled';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'waiting_human' || tasks.some((task) => task.status === 'waiting_human')) return 'waiting_human';
  if (run.status === 'paused' || run.status === 'pause_requested') return 'paused';
  if (tasks.some((task) => task.status === 'blocked')) return 'attention';
  if (tasks.some((task) => task.status === 'waiting_review')) return 'waiting_review';
  if (run.status === 'completed') return 'completed';
  return 'healthy';
}

function engineToneClass(run: OrchestratorRun, tasks: OrchestratorAgentTask[]) {
  const label = deriveEngineStateLabel(run, tasks);
  if (label === 'healthy' || label === 'completed') return 'text-emerald-600';
  if (label === 'waiting_review' || label === 'paused' || label === 'waiting_human') return 'text-amber-600';
  return 'text-rose-600';
}

function deriveEngineHealthSummary(
  run: OrchestratorRun,
  tasks: OrchestratorAgentTask[],
  agentRuns: OrchestratorAgentRun[],
  reviewLogs: OrchestratorReviewLog[],
) {
  if (run.watchdogWarning) return run.watchdogWarning;
  if (run.failureState) {
    return `${run.failureState.kind}: ${run.failureState.summary}`;
  }
  if (run.status === 'waiting_human' || tasks.some((task) => task.status === 'waiting_human')) {
    return run.pendingHumanCheckpoint || 'Run is waiting for human action before it can continue.';
  }
  const blocked = tasks.filter((task) => task.status === 'blocked');
  if (blocked.length > 0) {
    return `${blocked.length} task(s) are blocked and waiting for rework or human action.`;
  }
  const waitingReview = tasks.filter((task) => task.status === 'waiting_review');
  if (waitingReview.length > 0) {
    return `${waitingReview.length} task(s) finished execution and are waiting for review.`;
  }
  const active = agentRuns.filter((agentRun) => ['ready', 'pending', 'running'].includes(agentRun.status));
  if (active.length > 0) {
    return `${active.length} agent session(s) are currently active.`;
  }
  if (reviewLogs.length > 0 && reviewLogs[0]?.decision !== 'approved') {
    return `Latest review result is ${reviewLogs[0].decision}.`;
  }
  if (run.status === 'completed') {
    return 'Run completed successfully and the engine has no remaining work.';
  }
  return 'Engine is healthy and waiting for the next orchestration step.';
}

function StringListBlock({
  label,
  values,
  emptyLabel,
}: {
  label: string;
  values: string[];
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      {values.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {values.map((value, index) => (
            <li key={`${label}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              {value}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 text-xs text-slate-400">{emptyLabel}</div>
      )}
    </div>
  );
}
