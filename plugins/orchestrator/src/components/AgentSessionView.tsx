import { useEffect, useState } from 'react';
import { AgentMessage } from '../../../../src/features/session/components/AgentMessage';
import { SystemMessage } from '../../../../src/features/session/components/SystemMessage';
import { UserMessage } from '../../../../src/features/session/components/UserMessage';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { useSession, useSessionStore } from '../../../../src/shared/state/useSessionStore';
import { EmptyState } from '../../../../src/shared/ui';
import { ORCHESTRATOR_COMMANDS, ORCHESTRATOR_VIEWS } from '../constants';
import { getAgentRun } from '../storage';
import type {
  OrchestratorAgentRun,
  OrchestratorAgentRunPayload,
  OrchestratorRun,
  ReviewAgentInputSnapshot,
  ReviewAgentOutputSnapshot,
  WorkAgentInputSnapshot,
  WorkAgentOutputSnapshot,
} from '../types';
import { formatDateTime } from '../utils';

export function AgentSessionView({ ctx, payload }: WorkbenchProps<OrchestratorAgentRunPayload>) {
  const [agentRun, setAgentRun] = useState<OrchestratorAgentRun>(payload.agentRun);
  const session = useSession(agentRun.sessionId);
  const parentSession = useSession(session?.parentId || null);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const isReviewAgent = agentRun.kind === 'review';
  const inputContract = isReviewAgent
    ? formatReviewInput(agentRun.input as ReviewAgentInputSnapshot)
    : formatWorkInput(agentRun.input as WorkAgentInputSnapshot);
  const outputSnapshot = isReviewAgent
    ? formatReviewOutput(agentRun.output as ReviewAgentOutputSnapshot | undefined)
    : formatWorkOutput(agentRun.output as WorkAgentOutputSnapshot | undefined);
  const assignment = agentRun.input.assignmentBrief;

  useEffect(() => {
    void (async () => {
      const latest = await getAgentRun(ctx, payload.agentRun.id);
      if (latest) {
        setAgentRun(latest);
      }
    })();
  }, [ctx, payload.agentRun.id]);

  async function refreshAgentRun() {
    const latest = await getAgentRun(ctx, payload.agentRun.id);
    if (latest) {
      setAgentRun(latest);
    }
  }

  async function approveResult() {
    if (isReviewAgent) {
      await ctx.commands.execute(ORCHESTRATOR_COMMANDS.overrideReview, {
        taskId: agentRun.taskId,
        decision: 'approved',
      });
    } else {
      await ctx.commands.execute(ORCHESTRATOR_COMMANDS.completeTask, {
        taskId: agentRun.taskId,
      });
    }
    await refreshAgentRun();
  }

  async function requestRework() {
    const feedback = window.prompt('Tell this agent what needs to change.', '');
    if (feedback === null) return;
    if (isReviewAgent) {
      await ctx.commands.execute(ORCHESTRATOR_COMMANDS.overrideReview, {
        taskId: agentRun.taskId,
        decision: 'needs_changes',
        feedback: feedback.trim() || undefined,
      });
      await refreshAgentRun();
      return;
    }
    if (feedback.trim()) {
      await ctx.commands.execute(ORCHESTRATOR_COMMANDS.updateTask, {
        taskId: agentRun.taskId,
        summary: feedback.trim(),
      });
    }
    if (['completed', 'failed', 'paused', 'cancelled'].includes(agentRun.status)) {
      await ctx.commands.execute(ORCHESTRATOR_COMMANDS.retryTask, {
        taskId: agentRun.taskId,
      });
    }
    await refreshAgentRun();
  }

  async function takeOverAgent() {
    await ctx.commands.execute(ORCHESTRATOR_COMMANDS.pauseRun, {
      runId: agentRun.runId,
    });
    setActiveSession(agentRun.sessionId);
  }

  async function returnControlToOrchestrator() {
    const run = await ctx.commands.execute<unknown, OrchestratorRun | null>(ORCHESTRATOR_COMMANDS.getRun, {
      runId: agentRun.runId,
    });
    if (!run) return;
    if (run.status === 'paused') {
      await ctx.commands.execute(ORCHESTRATOR_COMMANDS.resumeRun, {
        runId: run.id,
      });
    } else {
      await ctx.commands.execute(ORCHESTRATOR_COMMANDS.wakeRun, {
        runId: run.id,
        reason: 'user_request',
      });
    }
  }

  return (
    <div className="h-full overflow-auto bg-white px-6 py-5 text-sm text-slate-700">
      <div className="mx-auto max-w-[820px]">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <button
            className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600"
            onClick={() => void ctx.commands.execute<unknown, OrchestratorRun | null>(ORCHESTRATOR_COMMANDS.getRun, {
              runId: agentRun.runId,
            }).then((run) => {
              if (!run) return;
              ctx.ui.workbench.open({
                id: `orchestrator.run:${run.id}`,
                viewId: ORCHESTRATOR_VIEWS.run,
                title: run.goal,
                description: run.planTitle,
                payload: { run },
                layoutMode: 'replace',
              });
            })}
          >
            Back To Flow
          </button>
          {parentSession ? (
            <button
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600"
              onClick={() => setActiveSession(parentSession.id)}
            >
              Back To Conversation
            </button>
          ) : null}
          <button
            className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600"
            onClick={() => void takeOverAgent()}
          >
            Take Over In Conversation
          </button>
          <button
            className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-600"
            onClick={() => void returnControlToOrchestrator()}
          >
            Return Control To Orchestrator
          </button>
        </div>
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{agentRun.title}</h1>
              <div className="mt-1 text-sm text-slate-500">
                {agentRun.kind === 'review' ? 'Review Agent' : 'Work Agent'} · {agentRun.stageName || '-'} · {agentRun.status}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={['completed', 'cancelled'].includes(agentRun.status)}
                onClick={() => void approveResult()}
              >
                Approve Result
              </button>
              <button
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                onClick={() => void requestRework()}
              >
                Send Back For Rework
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Session" value={agentRun.sessionId} />
            <Info label="Task" value={agentRun.taskId} />
            <Info label="Assignment" value={assignment?.title || '-'} />
            <Info label="Deliverables" value={joinOrDash(assignment?.deliverables)} />
            <Info label="Agent Run" value={agentRun.id} />
            <Info label="Updated" value={formatDateTime(agentRun.updatedAt)} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <DetailBlock
              label="Input Contract"
              content={inputContract}
            />
            <DetailBlock
              label="Output Snapshot"
              content={outputSnapshot}
            />
          </div>
        </div>

        {!session || session.messages.length === 0 ? (
          <EmptyState title="Agent session not started" description="This agent has not produced any transcript yet." />
        ) : (
          <div className="space-y-6 pb-8">
            {session.messages.map((msg, index) => (
              msg.role === 'user' ? (
                <UserMessage key={msg.id || index} sessionId={session.id} message={msg} />
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
      </div>
    </div>
  );
}

function formatWorkInput(input: WorkAgentInputSnapshot) {
  return [
    `Run Goal: ${input.runGoal}`,
    `Plan: ${input.planTitle}`,
    `Assignment: ${input.assignmentBrief.title}`,
    `Why Now: ${input.assignmentBrief.whyNow}`,
    `Goal: ${input.assignmentBrief.goal}`,
    `Target Folder: ${input.targetFolder}`,
    `Expected Files: ${joinOrDash(input.expectedFiles)}`,
    `Review Target Paths: ${joinOrDash(input.assignmentBrief.reviewTargetPaths)}`,
    listBlock('Context', input.assignmentBrief.context),
    listBlock('Instructions', input.assignmentBrief.instructions),
    listBlock('Deliverables', input.assignmentBrief.deliverables),
    listBlock('Constraints', input.constraints),
  ].join('\n\n');
}

function formatReviewInput(input: ReviewAgentInputSnapshot) {
  return [
    `Run Goal: ${input.runGoal}`,
    `Plan: ${input.planTitle}`,
    `Assignment: ${input.assignmentBrief.title}`,
    `Why Now: ${input.assignmentBrief.whyNow}`,
    `Goal: ${input.assignmentBrief.goal}`,
    `Target Folder: ${input.targetFolder}`,
    `Expected Files: ${joinOrDash(input.expectedFiles)}`,
    `Review Target Paths: ${joinOrDash(input.assignmentBrief.reviewTargetPaths)}`,
    listBlock('Instructions', input.assignmentBrief.instructions),
    listBlock('Review Focus', input.assignmentBrief.reviewFocus),
    `Reviewed Task: ${input.reviewedTaskId || '-'}`,
    `Reviewed Artifacts: ${joinOrDash(input.reviewedArtifactSummaries)}`,
    `Reviewed Paths: ${joinOrDash(input.reviewedArtifactPaths)}`,
    listBlock('Constraints', input.constraints),
  ].join('\n\n');
}

function formatWorkOutput(output: WorkAgentOutputSnapshot | undefined) {
  if (!output) return 'No output snapshot yet.';
  return [
    `Summary: ${output.summary}`,
    `Artifacts: ${joinOrDash(output.artifactSummaries)}`,
    `Completed: ${formatDateTime(output.completedAt)}`,
  ].join('\n\n');
}

function formatReviewOutput(output: ReviewAgentOutputSnapshot | undefined) {
  if (!output) return 'No review decision yet.';
  return [
    `Decision: ${output.decision}`,
    `Summary: ${output.summary}`,
    `Reviewed Artifacts: ${joinOrDash(output.reviewedArtifactIds)}`,
    `Source: ${output.source}`,
    `Completed: ${formatDateTime(output.completedAt)}`,
    `Feedback:\n${output.feedback}`,
  ].join('\n\n');
}

function listBlock(label: string, items: string[] | undefined) {
  return items && items.length ? `${label}:\n- ${items.join('\n- ')}` : `${label}: -`;
}

function joinOrDash(items: string[] | undefined) {
  return items && items.length ? items.join(', ') : '-';
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 break-all font-medium text-slate-900">{value}</div>
    </div>
  );
}

function DetailBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{content}</pre>
    </div>
  );
}
