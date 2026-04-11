import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '@/plugin/sdk';
import { applyOrchestratorDecision, failOrchestratorTask, listReviewedArtifacts, overrideReviewDecision, recoverOrchestratorRun, retryOrchestratorTask, startOrchestratorRun, wakeRunById } from '../../plugins/orchestrator/src/runtime';
import { getProjectState, getRun, listAgentRunsForRun, listArtifactsForRun, listTasksForRun, saveAgentRun, saveArtifact, saveRun, saveTask } from '../../plugins/orchestrator/src/storage';
import { createRunFromPlan } from '../../plugins/orchestrator/src/utils';
import type { OrchestrationDecision, OrchestratorConfirmedPlan, OrchestratorReviewLog, OrchestratorRun } from '../../plugins/orchestrator/src/types';

vi.mock('../../plugins/orchestrator/src/agentSessionRuntime', () => ({
  interruptAgentSession: vi.fn(async () => {}),
  isAgentSessionActive: vi.fn(() => false),
  launchAgentSession: vi.fn(async (input: { onStarted?: () => Promise<void> | void }) => {
    await input.onStarted?.();
  }),
}));

vi.mock('../shared/state/useSessionStore', () => ({
  useSessionStore: {
    getState: () => ({
      sessions: new Map(),
    }),
  },
}));

function unwrapRun(result: OrchestratorRun | { run: OrchestratorRun; reviewLog: OrchestratorReviewLog }) {
  return 'run' in result ? result.run : result;
}

describe('orchestrator runtime', () => {
  let files = new Map<string, string>();
  let ctx: PluginContext;

  beforeEach(() => {
    files = new Map();
    ctx = createMockContext(files);
  });

  it('seeds all plan stages and starts the orchestrator run without completing immediately', async () => {
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_test_novel',
      title: 'Novel Outline Test',
      goal: 'Write a reviewed novel outline draft.',
      overview: 'Phase one end-to-end test.',
      constraints: ['Do not skip review.'],
      successCriteria: ['Produce a complete outline draft.'],
      decompositionPrinciples: ['Advance one stage at a time.'],
      humanCheckpoints: ['User confirms the plan before execution.'],
      reviewCheckpoints: ['Review each stage before continuing.'],
      reviewPolicy: 'Review every stage.',
      confirmedAt: Date.now(),
      stages: [
        {
          id: 'stage_1',
          name: 'Premise And Direction',
          goal: 'Define the premise.',
          deliverables: ['premise'],
          targetFolder: 'orchestrator-output/premise-and-direction',
          outputFiles: ['premise-and-direction.md'],
        },
        {
          id: 'stage_2',
          name: 'Worldbuilding',
          goal: 'Build the setting.',
          deliverables: ['world'],
          targetFolder: 'orchestrator-output/worldbuilding',
          outputFiles: ['worldbuilding.md'],
        },
      ],
    };

    const run = createRunFromPlan(plan, 'workbench');
    const started = await startOrchestratorRun(ctx, run);

    expect(started.status).toBe('running');
    expect(started.activeTaskCount).toBe(1);

    const persistedRun = await getRun(ctx, run.id);
    expect(persistedRun?.status).toBe('running');

    const tasks = await listTasksForRun(ctx, run.id);
    expect(tasks.filter((task) => task.nodeType === 'container')).toHaveLength(2);

    const agentRuns = await listAgentRunsForRun(ctx, run.id);
    expect(agentRuns).toHaveLength(0);
  });

  it('collects reviewed artifacts from the latest draft set only', async () => {
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_test_review_artifacts',
      title: 'Review Artifact Filter Test',
      goal: 'Review only the current draft.',
      overview: 'Ensure stale artifacts are excluded from reviewer input.',
      constraints: ['Review the latest draft only.'],
      successCriteria: ['Reviewer sees only current draft artifacts.'],
      decompositionPrinciples: ['Advance one stage at a time.'],
      humanCheckpoints: ['User confirms the plan before execution.'],
      reviewCheckpoints: ['Review each stage before continuing.'],
      reviewPolicy: 'Review every stage.',
      confirmedAt: Date.now(),
      stages: [
        {
          id: 'stage_1',
          name: 'Draft Stage',
          goal: 'Produce a draft.',
          deliverables: ['draft'],
          targetFolder: 'orchestrator-output/draft-stage',
          outputFiles: ['draft.md'],
        },
      ],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await startOrchestratorRun(ctx, run);

    const initialTasks = await listTasksForRun(ctx, run.id);
    const containerTask = initialTasks.find((task) => task.nodeType === 'container' && task.stageId === 'stage_1');
    expect(containerTask).toBeTruthy();

    await saveTask(ctx, {
      id: 'task_current_work',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: containerTask!.id,
      rootTaskId: containerTask!.rootTaskId,
      depth: containerTask!.depth + 1,
      order: containerTask!.order + 1,
      source: 'plan_seed',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Draft Stage',
      agentId: 'stage_1:work',
      agentName: 'Draft Stage Work Agent',
      title: 'Current draft task',
      status: 'completed',
      reviewRequired: true,
      summary: 'The current draft attempt.',
      sessionId: 'orchestrator-current-session',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
    });

    await saveTask(ctx, {
      id: 'task_previous_work',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: containerTask!.id,
      rootTaskId: containerTask!.rootTaskId,
      depth: containerTask!.depth + 1,
      order: containerTask!.order + 2,
      source: 'rework',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Draft Stage',
      agentId: 'stage_1:work',
      agentName: 'Draft Stage Work Agent',
      title: 'Previous draft task',
      status: 'completed',
      reviewRequired: true,
      summary: 'A previous draft attempt.',
      sessionId: 'orchestrator-old-session',
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 4000,
    });

    await saveArtifact(ctx, {
      id: 'artifact_previous_accepted',
      runId: run.id,
      agentRunId: 'agent_run_previous',
      taskId: 'task_previous_work',
      stageId: 'stage_1',
      stageName: 'Draft Stage',
      agentId: 'stage_1:work',
      agentName: 'Draft Stage Work Agent',
      name: 'Previous Accepted Output',
      logicalKey: 'stage_1:draft',
      status: 'accepted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/draft-stage/draft.md'],
      summary: 'Old accepted draft summary',
      acceptedByReviewLogId: 'review_old',
      content: 'old accepted content',
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 5000,
    });
    await saveArtifact(ctx, {
      id: 'artifact_previous_superseded',
      runId: run.id,
      agentRunId: 'agent_run_previous',
      taskId: 'task_previous_work',
      stageId: 'stage_1',
      stageName: 'Draft Stage',
      agentId: 'stage_1:work',
      agentName: 'Draft Stage Work Agent',
      name: 'Previous Superseded Output',
      logicalKey: 'stage_1:draft',
      status: 'superseded',
      version: 2,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/draft-stage/draft.md'],
      summary: 'Old superseded draft summary',
      content: 'old superseded content',
      createdAt: Date.now() - 3000,
      updatedAt: Date.now() - 3000,
    });
    await saveArtifact(ctx, {
      id: 'artifact_current_draft',
      runId: run.id,
      agentRunId: 'agent_run_current',
      taskId: 'task_current_work',
      stageId: 'stage_1',
      stageName: 'Draft Stage',
      agentId: 'stage_1:work',
      agentName: 'Draft Stage Work Agent',
      name: 'Current Draft Output',
      logicalKey: 'stage_1:draft',
      status: 'draft',
      version: 3,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/draft-stage/draft.md'],
      summary: 'Current draft summary',
      content: 'current draft content',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
    });

    const reviewedArtifacts = await listReviewedArtifacts(
      ctx,
      run.id,
      containerTask!.id,
      ['orchestrator-output/draft-stage/draft.md'],
    );

    expect(reviewedArtifacts.map((artifact) => artifact.id)).toEqual(['artifact_current_draft']);
    expect(reviewedArtifacts.map((artifact) => artifact.summary)).toEqual(['Current draft summary']);
  });

  it('migrates persisted runs that are missing newer plan fields', async () => {
    const now = Date.now();
    files.set('data/runs/run_legacy/run.json', JSON.stringify({
      id: 'run_legacy',
      planId: 'plan_legacy',
      planTitle: 'Legacy Run',
      goal: 'Load without crashing.',
      status: 'running',
      source: 'workbench',
      activeTaskCount: 0,
      createdAt: now,
      updatedAt: now,
      confirmedPlan: {
        id: 'plan_legacy',
        title: 'Legacy Run',
        goal: 'Load without crashing.',
        overview: 'Older persisted shape.',
        constraints: ['keep going'],
        successCriteria: ['works'],
        reviewPolicy: 'Review every stage.',
        stages: [],
        confirmedAt: now,
      },
    }));

    const run = await getRun(ctx, 'run_legacy');
    expect(run).toBeTruthy();
    expect(run?.schemaVersion).toBe(1);
    expect(run?.confirmedPlan.decompositionPrinciples).toEqual(['先保持高层阶段清晰，再在运行中逐步细化为可执行任务。']);
    expect(run?.confirmedPlan.humanCheckpoints).toEqual(['计划确认后再启动 run。']);
    expect(run?.confirmedPlan.reviewCheckpoints).toEqual(['每个主要阶段完成后进入审核。']);
    expect(run?.maxConcurrentTasks).toBe(2);
  });

  it('does not wake a run that is waiting for human action', async () => {
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_waiting_human',
      title: 'Waiting Human Test',
      goal: 'Stop at human checkpoint.',
      overview: 'Test waiting_human gate.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Gate on human checkpoints.'],
      humanCheckpoints: ['Need human approval.'],
      reviewCheckpoints: [],
      reviewPolicy: 'Ask human before continuing.',
      confirmedAt: Date.now(),
      stages: [],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await saveRun(ctx, {
      ...run,
      status: 'waiting_human',
      pendingHumanCheckpoint: 'Awaiting approval.',
    });

    const woke = await wakeRunById(ctx, { runId: run.id, reason: 'user_request' });
    expect(woke.status).toBe('waiting_human');
    expect(woke.pendingHumanCheckpoint).toBe('Awaiting approval.');
  });

  it('moves the run to waiting_human when human review requests changes', async () => {
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_override_review',
      title: 'Override Review Test',
      goal: 'Require human follow-up after review.',
      overview: 'Review rejection should hard stop the run.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Review is a hard gate.'],
      humanCheckpoints: ['Human resolves failed review.'],
      reviewCheckpoints: ['Stage review required.'],
      reviewPolicy: 'Every stage must be approved.',
      confirmedAt: Date.now(),
      stages: [],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await saveRun(ctx, {
      ...run,
      status: 'running',
    });
    await saveTask(ctx, {
      id: 'task_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'waiting_review',
      reviewRequired: true,
      summary: 'Awaiting review.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await saveTask(ctx, {
      id: 'task_review',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: 'task_parent',
      rootTaskId: 'task_parent',
      depth: 1,
      order: 1,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:review',
      agentName: 'Review Agent',
      title: 'Review Agent task',
      status: 'ready',
      summary: 'Review current output.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await overrideReviewDecision(ctx, {
      taskId: 'task_review',
      decision: 'needs_changes',
      feedback: 'Please revise before continuing.',
    });
    const updatedRun = unwrapRun(result);
    expect(updatedRun.status).toBe('waiting_human');
    expect(updatedRun.pendingHumanCheckpoint).toBe('Please revise before continuing.');
    const tasks = await listTasksForRun(ctx, run.id);
    expect(tasks.some((task) => task.source === 'rework' && task.status === 'waiting_human')).toBe(true);
  });

  it('keeps human-approval tasks in waiting_human instead of making them ready', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_human_gate',
        title: 'Human Gate Plan',
        goal: 'Require human approval before dispatch.',
        overview: 'Gate create_task output.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Human gates are hard stops.'],
        humanCheckpoints: ['Human approves expansion tasks.'],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        stages: [{
          id: 'stage_1',
          name: 'Stage 1',
          goal: 'Do stage 1.',
          deliverables: ['result'],
          targetFolder: 'orchestrator-output/stage-1',
          outputFiles: ['stage-1.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_gate',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_gate',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'ready',
      reviewRequired: true,
      summary: 'Ready.',
      createdAt: now,
      updatedAt: now,
    });
    files.set(`data/runs/${run.id}/orchestrator-agent-runs.json`, JSON.stringify([{
      schemaVersion: 1,
      id: 'coordinator_1',
      runId: run.id,
      sessionId: 'session_1',
      title: 'Coordinator',
      prompt: 'prompt',
      input: {
        runGoal: run.goal,
        planTitle: run.planTitle,
        planOverview: run.confirmedPlan.overview,
        decompositionPrinciples: run.confirmedPlan.decompositionPrinciples,
        humanCheckpoints: run.confirmedPlan.humanCheckpoints,
        reviewCheckpoints: run.confirmedPlan.reviewCheckpoints,
        reviewPolicy: run.confirmedPlan.reviewPolicy,
        currentStageOutputFiles: [],
        currentStageReviewableOutputPaths: [],
        currentStageDraftOutputSummaries: [],
        currentStageAllowedDispatchKinds: [],
        activeTaskCount: 0,
        availableSlots: 2,
        readyTaskTitles: [],
        blockedTaskTitles: [],
        waitingReviewTaskTitles: [],
        latestReviewSummaries: [],
        projectStateSummary: [],
        actionableTasks: [],
        candidateDispatches: [],
      },
      status: 'running',
      createdAt: now,
      updatedAt: now,
    }]));

    const runtime = await import('../../plugins/orchestrator/src/runtime');
    const applyDecision = (runtime as unknown as { applyOrchestratorDecision?: (ctx: PluginContext, runId: string, coordinatorRunId: string, decision: OrchestrationDecision) => Promise<unknown> }).applyOrchestratorDecision;
    expect(applyDecision).toBeTypeOf('function');
    await applyDecision!(ctx, run.id, 'coordinator_1', {
      status: 'wait',
      summary: 'Create a human-gated subtask.',
      currentStageId: 'stage_1',
      currentStageName: 'Stage 1',
      currentAgentId: 'stage_1:orchestrator',
      currentAgentName: 'Coordinator',
      dispatches: [],
      taskOperations: [{
        type: 'create_task',
        parentTaskId: 'task_parent_gate',
        title: 'Needs human approval',
        targetFolder: 'orchestrator-output/stage-1',
        expectedFiles: ['stage-1.md'],
        requiresHumanApproval: true,
        note: 'Approve before dispatch.',
      }],
    });

    const tasks = await listTasksForRun(ctx, run.id);
    const gatedTask = tasks.find((task) => task.title === 'Needs human approval');
    const parentTask = tasks.find((task) => task.id === 'task_parent_gate');
    const nextRun = await getRun(ctx, run.id);
    expect(gatedTask?.status).toBe('waiting_human');
    expect(parentTask?.status).toBe('waiting_human');
    expect(nextRun?.status).toBe('waiting_human');
  });

  it('accepts reviewed artifacts into project state on approval', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_accept_review',
        title: 'Accept Review Plan',
        goal: 'Promote approved artifacts into project state.',
        overview: 'Artifact lifecycle test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Only accepted artifacts enter project state.'],
        humanCheckpoints: [],
        reviewCheckpoints: ['Review before accept.'],
        reviewPolicy: 'Approve before continue.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_accept',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_accept',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'waiting_review',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_work_accept',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_parent_accept',
      rootTaskId: 'task_parent_accept',
      depth: 1,
      order: 1,
      source: 'plan_seed',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      title: 'Work task',
      status: 'completed',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_review_accept',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: 'task_parent_accept',
      rootTaskId: 'task_parent_accept',
      depth: 1,
      order: 2,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:review',
      agentName: 'Review Agent',
      title: 'Review task',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_draft_accept',
      runId: run.id,
      agentRunId: 'agent_work_accept',
      taskId: 'task_work_accept',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      name: 'Draft Output',
      logicalKey: 'stage_1.work',
      status: 'review_submitted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/stage-1/output.md'],
      summary: 'Current draft output',
      content: 'draft content',
      createdAt: now,
      updatedAt: now,
    });

    await overrideReviewDecision(ctx, {
      taskId: 'task_review_accept',
      decision: 'approved',
      feedback: 'Looks good.',
    });

    const artifacts = await listArtifactsForRun(ctx, run.id);
    const projectState = await getProjectState(ctx, run.id);
    const nextRun = await getRun(ctx, run.id);
    const acceptedArtifact = artifacts.find((artifact) => artifact.id === 'artifact_draft_accept');
    expect(nextRun?.failureState).toBeUndefined();
    expect(acceptedArtifact?.status).toBe('accepted');
    expect(projectState?.entries.map((entry) => entry.artifactId)).toContain('artifact_draft_accept');
  });

  it('marks reviewed artifacts rejected and records failure state when review requests changes', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_reject_review',
        title: 'Reject Review Plan',
        goal: 'Block on rejected review.',
        overview: 'Artifact rejection test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Rejected artifacts stay out of project state.'],
        humanCheckpoints: ['Human resolves rejected review.'],
        reviewCheckpoints: ['Review before continue.'],
        reviewPolicy: 'Require review.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_reject',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_reject',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'waiting_review',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_review_reject',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: 'task_parent_reject',
      rootTaskId: 'task_parent_reject',
      depth: 1,
      order: 2,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:review',
      agentName: 'Review Agent',
      title: 'Review task',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_work_reject',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_parent_reject',
      rootTaskId: 'task_parent_reject',
      depth: 1,
      order: 1,
      source: 'plan_seed',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      title: 'Work task',
      status: 'completed',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_draft_reject',
      runId: run.id,
      agentRunId: 'agent_work_reject',
      taskId: 'task_work_reject',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      name: 'Draft Output',
      logicalKey: 'stage_1.work',
      status: 'review_submitted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/stage-1/output.md'],
      summary: 'Needs fixes',
      content: 'draft content',
      createdAt: now,
      updatedAt: now,
    });

    const result = await overrideReviewDecision(ctx, {
      taskId: 'task_review_reject',
      decision: 'needs_changes',
      feedback: 'Fix the draft and resubmit.',
    });

    const artifacts = await listArtifactsForRun(ctx, run.id);
    const rejectedArtifact = artifacts.find((artifact) => artifact.id === 'artifact_draft_reject');
    const updatedRun = unwrapRun(result);
    expect(updatedRun.status).toBe('waiting_human');
    expect(updatedRun.failureState?.kind).toBe('human_required');
    expect(rejectedArtifact?.status).toBe('rejected');
  });

  it('records structured failure state when a task hard-fails', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_task_failure',
        title: 'Task Failure Plan',
        goal: 'Capture structured failure state.',
        overview: 'Failure state test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Persist failures structurally.'],
        humanCheckpoints: ['Inspect hard failures.'],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
      activeTaskCount: 1,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_fail',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      rootTaskId: 'task_fail',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      latestAgentRunId: 'agent_run_fail',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      title: 'Work task',
      status: 'running',
      failurePolicy: 'pause',
      createdAt: now,
      updatedAt: now,
    });
    await saveAgentRun(ctx, {
      id: 'agent_run_fail',
      runId: run.id,
      taskId: 'task_fail',
      planId: run.planId,
      kind: 'work',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      sessionId: 'session_fail',
      title: 'Work Agent',
      prompt: 'prompt',
      input: {
        assignmentBrief: {
          assignmentId: 'assignment_fail',
          runId: run.id,
          taskId: 'task_fail',
          kind: 'work',
          title: 'Failure Assignment',
          whyNow: 'Test failure state.',
          goal: 'Do the work.',
          context: [],
          inputArtifacts: [],
          instructions: [],
          acceptanceCriteria: [],
          deliverables: [],
          targetFolder: 'orchestrator-output/stage-1',
          expectedFiles: ['output.md'],
          reviewTargetPaths: ['orchestrator-output/stage-1/output.md'],
          reviewFocus: [],
          risks: [],
          createdAt: now,
        },
        runGoal: run.goal,
        planTitle: run.planTitle,
        stageId: 'stage_1',
        stageName: 'Stage 1',
        constraints: [],
        targetFolder: 'orchestrator-output/stage-1',
        expectedFiles: ['output.md'],
        acceptedArtifactSummaries: [],
        recentReviewSummaries: [],
        projectStateSummary: [],
      },
      status: 'running',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await failOrchestratorTask(ctx, 'task_fail', new Error('Boom'));

    const failedRun = await getRun(ctx, run.id);
    expect(failedRun?.status).toBe('paused');
    expect(failedRun?.failureState?.kind).toBe('agent_runtime_error');
    expect(failedRun?.failureState?.taskId).toBe('task_fail');
    expect(failedRun?.failureState?.summary).toBe('Boom');
  });

  it('schedules an automatic retry for transient task failures', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_auto_retry',
        title: 'Auto Retry Plan',
        goal: 'Retry transient failures automatically.',
        overview: 'Auto retry test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Retry transient provider failures automatically.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
      activeTaskCount: 1,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_auto_retry',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      rootTaskId: 'task_auto_retry',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      latestAgentRunId: 'agent_run_auto_retry',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      title: 'Work task',
      status: 'running',
      failurePolicy: 'pause',
      createdAt: now,
      updatedAt: now,
    });
    await saveAgentRun(ctx, {
      id: 'agent_run_auto_retry',
      runId: run.id,
      taskId: 'task_auto_retry',
      planId: run.planId,
      kind: 'work',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      sessionId: 'session_auto_retry',
      title: 'Work Agent',
      prompt: 'prompt',
      input: {
        assignmentBrief: {
          assignmentId: 'assignment_auto_retry',
          runId: run.id,
          taskId: 'task_auto_retry',
          kind: 'work',
          title: 'Auto Retry Assignment',
          whyNow: 'Test auto retry.',
          goal: 'Test auto retry.',
          context: [],
          inputArtifacts: [],
          instructions: [],
          acceptanceCriteria: [],
          deliverables: [],
          targetFolder: 'orchestrator-output/stage-1',
          expectedFiles: ['output.md'],
          reviewTargetPaths: ['orchestrator-output/stage-1/output.md'],
          reviewFocus: [],
          risks: [],
          createdAt: now,
        },
        runGoal: run.goal,
        planTitle: run.planTitle,
        stageId: 'stage_1',
        stageName: 'Stage 1',
        constraints: [],
        targetFolder: 'orchestrator-output/stage-1',
        expectedFiles: ['output.md'],
        acceptedArtifactSummaries: [],
        recentReviewSummaries: [],
        projectStateSummary: [],
      },
      status: 'failed',
      createdAt: now,
      updatedAt: now,
    });

    await failOrchestratorTask(ctx, 'task_auto_retry', new Error('429 Too Many Requests'));

    const failedRun = await getRun(ctx, run.id);
    const failedTask = (await listTasksForRun(ctx, run.id)).find((task) => task.id === 'task_auto_retry');
    expect(failedRun?.status).toBe('running');
    expect(failedRun?.failureState?.retryable).toBe(true);
    expect(failedRun?.failureState?.requiresHuman).toBe(false);
    expect(typeof failedRun?.failureState?.autoRetryAt).toBe('number');
    expect(failedTask?.status).toBe('failed');
    expect(failedTask?.summary).toContain('retrying automatically in 10s');
  });

  it('rejects orchestration decisions that include dispatches for non-dispatch statuses', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_invalid_decision',
        title: 'Invalid Decision Plan',
        goal: 'Only allow legal orchestration decisions.',
        overview: 'Decision validation test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Only legal decisions can be applied.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        stages: [{
          id: 'stage_1',
          name: 'Stage 1',
          goal: 'Do stage 1.',
          deliverables: ['result'],
          targetFolder: 'orchestrator-output/stage-1',
          outputFiles: ['stage-1.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      currentStageId: 'stage_1',
      currentStageName: 'Stage 1',
      orchestrationInput: {
        runGoal: 'Only allow legal orchestration decisions.',
        planTitle: 'Invalid Decision Plan',
        planOverview: 'Decision validation test.',
        decompositionPrinciples: ['Only legal decisions can be applied.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        currentStageId: 'stage_1',
        currentStageName: 'Stage 1',
        currentStageTargetFolder: 'orchestrator-output/stage-1',
        currentStageOutputFiles: ['stage-1.md'],
        currentStageReviewableOutputPaths: ['orchestrator-output/stage-1/stage-1.md'],
        currentStageDraftOutputSummaries: [],
        currentStageAllowedDispatchKinds: ['work'] as Array<'work' | 'review'>,
        activeTaskCount: 0,
        availableSlots: 2,
        readyTaskTitles: ['Stage 1'],
        blockedTaskTitles: [],
        waitingReviewTaskTitles: [],
        latestReviewSummaries: [],
        projectStateSummary: [],
        actionableTasks: ['Stage 1'],
        candidateDispatches: ['WORK · Stage 1 · Stage 1 Work Agent · targetFolder=orchestrator-output/stage-1 · expectedFiles=stage-1.md'],
      },
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_invalid',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_invalid',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'ready',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    files.set(`data/runs/${run.id}/orchestrator-agent-runs.json`, JSON.stringify([{
      schemaVersion: 1,
      id: 'coordinator_invalid',
      runId: run.id,
      sessionId: 'session_invalid',
      title: 'Coordinator',
      prompt: 'prompt',
      input: run.orchestrationInput,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    }]));

    await expect(applyOrchestratorDecision(ctx, run.id, 'coordinator_invalid', {
      status: 'wait',
      summary: 'This illegally mixes wait with dispatch.',
      currentStageId: 'stage_1',
      currentStageName: 'Stage 1',
      dispatches: [{
        parentTaskId: 'task_parent_invalid',
        stageId: 'stage_1',
        stageName: 'Stage 1',
        kind: 'work',
        agentId: 'stage_1:work',
        agentName: 'Stage 1 Work Agent',
        assignmentBrief: {
          assignmentId: 'assignment_invalid',
          runId: run.id,
          taskId: 'task_parent_invalid',
          kind: 'work',
          title: 'Illegal dispatch',
          whyNow: 'Should fail.',
          goal: 'Should fail.',
          context: [],
          inputArtifacts: [],
          instructions: [],
          acceptanceCriteria: [],
          deliverables: ['result'],
          targetFolder: 'orchestrator-output/stage-1',
          expectedFiles: ['stage-1.md'],
          reviewTargetPaths: ['orchestrator-output/stage-1/stage-1.md'],
          reviewFocus: [],
          risks: [],
          createdAt: now,
        },
      }],
      taskOperations: [],
    })).rejects.toThrow('cannot include dispatches');
  });

  it('records allowed dispatch metadata in orchestration decision records', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_decision_audit',
        title: 'Decision Audit Plan',
        goal: 'Persist decision audit metadata.',
        overview: 'Decision record test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Audit every coordinator decision.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        stages: [{
          id: 'stage_1',
          name: 'Stage 1',
          goal: 'Do stage 1.',
          deliverables: ['result'],
          targetFolder: 'orchestrator-output/stage-1',
          outputFiles: ['stage-1.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      currentStageId: 'stage_1',
      currentStageName: 'Stage 1',
      orchestrationInput: {
        runGoal: 'Persist decision audit metadata.',
        planTitle: 'Decision Audit Plan',
        planOverview: 'Decision record test.',
        decompositionPrinciples: ['Audit every coordinator decision.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        currentStageId: 'stage_1',
        currentStageName: 'Stage 1',
        currentStageTargetFolder: 'orchestrator-output/stage-1',
        currentStageOutputFiles: ['stage-1.md'],
        currentStageReviewableOutputPaths: ['orchestrator-output/stage-1/stage-1.md'],
        currentStageDraftOutputSummaries: [],
        currentStageAllowedDispatchKinds: ['work'] as Array<'work' | 'review'>,
        activeTaskCount: 0,
        availableSlots: 2,
        readyTaskTitles: ['Stage 1'],
        blockedTaskTitles: [],
        waitingReviewTaskTitles: [],
        latestReviewSummaries: [],
        projectStateSummary: [],
        actionableTasks: ['Stage 1'],
        candidateDispatches: ['WORK · Stage 1 · Stage 1 Work Agent · targetFolder=orchestrator-output/stage-1 · expectedFiles=stage-1.md'],
      },
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_audit',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_audit',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'ready',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    files.set(`data/runs/${run.id}/orchestrator-agent-runs.json`, JSON.stringify([{
      schemaVersion: 1,
      id: 'coordinator_audit',
      runId: run.id,
      sessionId: 'session_audit',
      title: 'Coordinator',
      prompt: 'prompt',
      input: run.orchestrationInput,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    }]));

    await applyOrchestratorDecision(ctx, run.id, 'coordinator_audit', {
      status: 'wait',
      summary: 'Hold position until slots open.',
      currentStageId: 'stage_1',
      currentStageName: 'Stage 1',
      dispatches: [],
      taskOperations: [{
        type: 'wait',
        note: 'No dispatch yet.',
      }],
    });

    const nextRun = await getRun(ctx, run.id);
    expect(nextRun?.orchestrationDecision?.allowedDispatchKinds).toEqual(['work']);
    expect(nextRun?.orchestrationDecision?.candidateDispatches).toHaveLength(1);
    expect(nextRun?.orchestrationDecision?.taskOperationTypes).toEqual(['wait']);
  });

  it('creates explicit checkpoint tasks for human checkpoints', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_checkpoint',
        title: 'Checkpoint Plan',
        goal: 'Require an explicit human checkpoint.',
        overview: 'Checkpoint task test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Checkpoint must be explicit.'],
        humanCheckpoints: ['Pause for approval.'],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        stages: [{
          id: 'stage_1',
          name: 'Stage 1',
          goal: 'Do stage 1.',
          deliverables: ['result'],
          targetFolder: 'orchestrator-output/stage-1',
          outputFiles: ['stage-1.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      currentStageId: 'stage_1',
      currentStageName: 'Stage 1',
      orchestrationInput: {
        runGoal: 'Require an explicit human checkpoint.',
        planTitle: 'Checkpoint Plan',
        planOverview: 'Checkpoint task test.',
        decompositionPrinciples: ['Checkpoint must be explicit.'],
        humanCheckpoints: ['Pause for approval.'],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        currentStageId: 'stage_1',
        currentStageName: 'Stage 1',
        currentStageTargetFolder: 'orchestrator-output/stage-1',
        currentStageOutputFiles: ['stage-1.md'],
        currentStageReviewableOutputPaths: ['orchestrator-output/stage-1/stage-1.md'],
        currentStageDraftOutputSummaries: [],
        currentStageAllowedDispatchKinds: ['work'] as Array<'work' | 'review'>,
        activeTaskCount: 0,
        availableSlots: 2,
        readyTaskTitles: ['Stage 1'],
        blockedTaskTitles: [],
        waitingReviewTaskTitles: [],
        latestReviewSummaries: [],
        projectStateSummary: [],
        actionableTasks: ['Stage 1'],
        candidateDispatches: ['WORK · Stage 1 · Stage 1 Work Agent · targetFolder=orchestrator-output/stage-1 · expectedFiles=stage-1.md'],
      },
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_checkpoint',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_checkpoint',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'ready',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    files.set(`data/runs/${run.id}/orchestrator-agent-runs.json`, JSON.stringify([{
      schemaVersion: 1,
      id: 'coordinator_checkpoint',
      runId: run.id,
      sessionId: 'session_checkpoint',
      title: 'Coordinator',
      prompt: 'prompt',
      input: run.orchestrationInput,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    }]));

    await applyOrchestratorDecision(ctx, run.id, 'coordinator_checkpoint', {
      status: 'wait',
      summary: 'Pause for explicit approval.',
      currentStageId: 'stage_1',
      currentStageName: 'Stage 1',
      dispatches: [],
      taskOperations: [{
        type: 'create_checkpoint',
        parentTaskId: 'task_parent_checkpoint',
        note: 'Approve Stage 1 before any more work.',
      }],
    });

    const tasks = await listTasksForRun(ctx, run.id);
    const checkpointTask = tasks.find((task) => task.nodeType === 'checkpoint');
    const nextRun = await getRun(ctx, run.id);
    expect(checkpointTask?.status).toBe('waiting_human');
    expect(checkpointTask?.blockedReason).toBe('Approve Stage 1 before any more work.');
    expect(nextRun?.status).toBe('waiting_human');
  });

  it('escalates rejected review decisions to failed instead of creating rework', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_rejected_review',
        title: 'Rejected Review Plan',
        goal: 'Escalate rejected review.',
        overview: 'Rejected review test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Rejected review is terminal until human intervention.'],
        humanCheckpoints: ['Human inspects rejected stage.'],
        reviewCheckpoints: ['Review before continue.'],
        reviewPolicy: 'Require review.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_rejected',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_rejected',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'waiting_review',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_review_rejected',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: 'task_parent_rejected',
      rootTaskId: 'task_parent_rejected',
      depth: 1,
      order: 1,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:review',
      agentName: 'Review Agent',
      title: 'Review task',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_rejected',
      runId: run.id,
      agentRunId: 'agent_work_rejected',
      taskId: 'task_parent_rejected',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      name: 'Draft Output',
      logicalKey: 'stage_1.work',
      status: 'review_submitted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/stage-1/output.md'],
      summary: 'Bad draft',
      content: 'draft content',
      createdAt: now,
      updatedAt: now,
    });

    const result = await overrideReviewDecision(ctx, {
      taskId: 'task_review_rejected',
      decision: 'rejected',
      feedback: 'This stage must be manually re-planned.',
    });

    const tasks = await listTasksForRun(ctx, run.id);
    const updatedRun = unwrapRun(result);
    expect(updatedRun.status).toBe('failed');
    expect(updatedRun.failureState?.kind).toBe('review_deadlock');
    expect(tasks.some((task) => task.source === 'rework')).toBe(false);
  });

  it('escalates repeated rework into non_converging_rework', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_non_converging_rework',
        title: 'Non Converging Rework Plan',
        goal: 'Fail when rework does not converge.',
        overview: 'Rework escalation test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Escalate repeated rework.'],
        humanCheckpoints: ['Human intervenes after repeated rework.'],
        reviewCheckpoints: ['Review before continue.'],
        reviewPolicy: 'Require review.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_rework_limit',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_rework_limit',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'waiting_review',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_work_rework_limit',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_parent_rework_limit',
      rootTaskId: 'task_parent_rework_limit',
      depth: 1,
      order: 1,
      source: 'plan_seed',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      title: 'Work task',
      status: 'completed',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_existing_rework_1',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_parent_rework_limit',
      rootTaskId: 'task_parent_rework_limit',
      depth: 1,
      order: 2,
      source: 'rework',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Rework 1',
      status: 'waiting_human',
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_existing_rework_2',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_parent_rework_limit',
      rootTaskId: 'task_parent_rework_limit',
      depth: 1,
      order: 3,
      source: 'rework',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Rework 2',
      status: 'waiting_human',
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_review_rework_limit',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: 'task_parent_rework_limit',
      rootTaskId: 'task_parent_rework_limit',
      depth: 1,
      order: 4,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:review',
      agentName: 'Review Agent',
      title: 'Review task',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_rework_limit',
      runId: run.id,
      agentRunId: 'agent_work_rework_limit',
      taskId: 'task_work_rework_limit',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      name: 'Draft Output',
      logicalKey: 'stage_1.work',
      status: 'review_submitted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/stage-1/output.md'],
      summary: 'Still not good enough',
      content: 'draft content',
      createdAt: now,
      updatedAt: now,
    });

    const result = await overrideReviewDecision(ctx, {
      taskId: 'task_review_rework_limit',
      decision: 'needs_changes',
      feedback: 'Rework is not converging.',
    });

    const updatedRun = unwrapRun(result);
    expect(updatedRun.status).toBe('failed');
    expect(updatedRun.failureState?.kind).toBe('non_converging_rework');
  });

  it('does not auto-recover runs that require human intervention', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_recover_gate',
        title: 'Recover Gate Plan',
        goal: 'Do not recover waiting human runs.',
        overview: 'Recover gate test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Recovery must respect human boundaries.'],
        humanCheckpoints: ['Human intervention required.'],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'waiting_human' as const,
      failureState: {
        kind: 'human_required' as const,
        summary: 'Need human review.',
        retryable: true,
        requiresHuman: true,
        recommendedAction: 'Wait for a human.',
        firstOccurredAt: now,
        lastOccurredAt: now,
        retryCount: 1,
      },
    };
    await saveRun(ctx, run);

    const recovered = await recoverOrchestratorRun(ctx, run.id);
    expect(recovered?.status).toBe('waiting_human');
    expect((await listAgentRunsForRun(ctx, run.id))).toHaveLength(0);
  });

  it('allows human retry for the task that owns a non-retryable failure', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_retry_gate',
        title: 'Retry Gate Plan',
        goal: 'Block retry on non-retryable failures.',
        overview: 'Retry gate test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Retry only retryable failures.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'paused' as const,
      failureState: {
        kind: 'review_deadlock' as const,
        summary: 'Manual intervention required.',
        retryable: false,
        requiresHuman: true,
        recommendedAction: 'Do not retry automatically.',
        taskId: 'task_retry_gate',
        firstOccurredAt: now,
        lastOccurredAt: now,
        retryCount: 1,
      },
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_retry_gate',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      rootTaskId: 'task_retry_gate',
      depth: 0,
      order: 0,
      source: 'rework',
      latestAgentRunId: 'agent_run_retry_gate',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      title: 'Work task',
      status: 'failed',
      failurePolicy: 'pause',
      createdAt: now,
      updatedAt: now,
    });
    await saveAgentRun(ctx, {
      id: 'agent_run_retry_gate',
      runId: run.id,
      taskId: 'task_retry_gate',
      planId: run.planId,
      kind: 'work',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      sessionId: 'session_retry_gate',
      title: 'Work Agent',
      prompt: 'prompt',
      input: {
        assignmentBrief: {
          assignmentId: 'assignment_retry_gate',
          runId: run.id,
          taskId: 'task_retry_gate',
          kind: 'work',
          title: 'Retry Gate Assignment',
          whyNow: 'Should not retry.',
          goal: 'Should not retry.',
          context: [],
          inputArtifacts: [],
          instructions: [],
          acceptanceCriteria: [],
          deliverables: [],
          targetFolder: 'orchestrator-output/stage-1',
          expectedFiles: ['output.md'],
          reviewTargetPaths: ['orchestrator-output/stage-1/output.md'],
          reviewFocus: [],
          risks: [],
          createdAt: now,
        },
        runGoal: run.goal,
        planTitle: run.planTitle,
        stageId: 'stage_1',
        stageName: 'Stage 1',
        constraints: [],
        targetFolder: 'orchestrator-output/stage-1',
        expectedFiles: ['output.md'],
        acceptedArtifactSummaries: [],
        recentReviewSummaries: [],
        projectStateSummary: [],
      },
      status: 'failed',
      createdAt: now,
      updatedAt: now,
    });

    const result = await retryOrchestratorTask(ctx, { taskId: 'task_retry_gate' });
    expect(result.run?.status).toBe('running');
    expect(result.run?.failureState).toBeUndefined();
    expect(result.run?.watchdogStatus).toBe('healthy');
    expect(result.task?.status).toBe('ready');
  });

  it('blocks retry when another task owns the non-retryable failure', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_retry_gate_other',
        title: 'Retry Gate Other Plan',
        goal: 'Block retry when another task owns the failure.',
        overview: 'Retry gate test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Only the failed task can be manually retried.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'paused' as const,
      failureState: {
        kind: 'review_deadlock' as const,
        summary: 'Manual intervention required.',
        retryable: false,
        requiresHuman: true,
        recommendedAction: 'Do not retry automatically.',
        taskId: 'task_failure_owner',
        firstOccurredAt: now,
        lastOccurredAt: now,
        retryCount: 1,
      },
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_retry_gate_other',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      rootTaskId: 'task_retry_gate_other',
      depth: 0,
      order: 0,
      source: 'rework',
      latestAgentRunId: 'agent_run_retry_gate_other',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      title: 'Work task',
      status: 'failed',
      failurePolicy: 'pause',
      createdAt: now,
      updatedAt: now,
    });
    await saveAgentRun(ctx, {
      id: 'agent_run_retry_gate_other',
      runId: run.id,
      taskId: 'task_retry_gate_other',
      planId: run.planId,
      kind: 'work',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      sessionId: 'session_retry_gate_other',
      title: 'Work Agent',
      prompt: 'prompt',
      input: {
        assignmentBrief: {
          assignmentId: 'assignment_retry_gate_other',
          runId: run.id,
          taskId: 'task_retry_gate_other',
          kind: 'work',
          title: 'Retry Gate Assignment',
          whyNow: 'Should not retry.',
          goal: 'Should not retry.',
          context: [],
          inputArtifacts: [],
          instructions: [],
          acceptanceCriteria: [],
          deliverables: [],
          targetFolder: 'orchestrator-output/stage-1',
          expectedFiles: ['output.md'],
          reviewTargetPaths: ['orchestrator-output/stage-1/output.md'],
          reviewFocus: [],
          risks: [],
          createdAt: now,
        },
        runGoal: run.goal,
        planTitle: run.planTitle,
        stageId: 'stage_1',
        stageName: 'Stage 1',
        constraints: [],
        targetFolder: 'orchestrator-output/stage-1',
        expectedFiles: ['output.md'],
        acceptedArtifactSummaries: [],
        recentReviewSummaries: [],
        projectStateSummary: [],
      },
      status: 'failed',
      createdAt: now,
      updatedAt: now,
    });

    await expect(retryOrchestratorTask(ctx, { taskId: 'task_retry_gate_other' })).rejects.toThrow('another non-retryable failure');
  });

  it('does not redispatch review after a leaf stage review is approved', async () => {
    const now = Date.now();
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_leaf_review_once',
      title: 'Leaf Review Once',
      goal: 'Approve a single-stage run without duplicate review.',
      overview: 'Regression test for repeated review dispatch on leaf stages.',
      constraints: ['Review should happen only once per approved stage.'],
      successCriteria: ['Run completes without creating a second review task.'],
      decompositionPrinciples: ['Advance one stage at a time.'],
      humanCheckpoints: [],
      reviewCheckpoints: ['Review the only stage.'],
      reviewPolicy: 'Review every stage.',
      confirmedAt: now,
      stages: [
        {
          id: 'stage_leaf',
          name: 'Leaf Stage',
          goal: 'Write a single reviewed output.',
          deliverables: ['leaf'],
          targetFolder: 'orchestrator-output/leaf-stage',
          outputFiles: ['leaf.md'],
        },
      ],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await startOrchestratorRun(ctx, run);

    const seededTasks = await listTasksForRun(ctx, run.id);
    const containerTask = seededTasks.find((task) => task.nodeType === 'container' && task.stageId === 'stage_leaf');
    expect(containerTask).toBeTruthy();

    await saveTask(ctx, {
      id: 'task_leaf_work',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: containerTask!.id,
      rootTaskId: containerTask!.rootTaskId,
      depth: containerTask!.depth + 1,
      order: containerTask!.order + 1,
      source: 'plan_seed',
      attemptCount: 1,
      stageId: 'stage_leaf',
      planStageId: 'stage_leaf',
      stageName: 'Leaf Stage',
      agentId: 'stage_leaf:work',
      agentName: 'Leaf Work Agent',
      title: 'Leaf work',
      status: 'completed',
      reviewRequired: true,
      targetFolder: 'orchestrator-output/leaf-stage',
      expectedFiles: ['leaf.md'],
      expectedOutputs: ['leaf.md'],
      latestArtifactIds: ['artifact_leaf_draft'],
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_leaf_draft',
      runId: run.id,
      agentRunId: 'agent_run_leaf_work',
      taskId: 'task_leaf_work',
      stageId: 'stage_leaf',
      stageName: 'Leaf Stage',
      agentId: 'stage_leaf:work',
      agentName: 'Leaf Work Agent',
      name: 'Leaf Draft',
      logicalKey: 'stage_leaf:leaf',
      status: 'draft',
      version: 1,
      kind: 'report',
      format: 'markdown',
      filePaths: ['orchestrator-output/leaf-stage/leaf.md'],
      summary: 'Leaf draft summary',
      content: 'leaf draft content',
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_leaf_review',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: containerTask!.id,
      rootTaskId: containerTask!.rootTaskId,
      depth: containerTask!.depth + 1,
      order: containerTask!.order + 2,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_leaf',
      planStageId: 'stage_leaf',
      stageName: 'Leaf Stage',
      agentId: 'stage_leaf:review',
      agentName: 'Leaf Review Agent',
      title: 'Leaf review',
      status: 'waiting_human',
      targetFolder: 'orchestrator-output/leaf-stage',
      expectedFiles: ['leaf.md'],
      createdAt: now,
      updatedAt: now,
    });
    await saveRun(ctx, {
      ...(await getRun(ctx, run.id))!,
      status: 'waiting_human',
      activeTaskCount: 0,
      currentStageId: 'stage_leaf',
      currentStageName: 'Leaf Stage',
      pendingHumanCheckpoint: 'Approve review.',
      updatedAt: now,
    });

    const approvedRun = await overrideReviewDecision(ctx, {
      taskId: 'task_leaf_review',
      decision: 'approved',
      feedback: 'Approved after human review.',
    });

    expect(['running', 'completed']).toContain(unwrapRun(approvedRun).status);

    const afterApprovalTasks = await listTasksForRun(ctx, run.id);
    const refreshedContainer = afterApprovalTasks.find((task) => task.id === containerTask!.id);
    expect(refreshedContainer?.status).toBe('completed');

    await wakeRunById(ctx, { runId: run.id, reason: 'user_request' });

    const finalTasks = await listTasksForRun(ctx, run.id);
    expect(finalTasks.filter((task) => task.kind === 'review')).toHaveLength(1);
    expect(finalTasks.find((task) => task.id === containerTask!.id)?.status).toBe('completed');
  });
});

function createMockContext(files: Map<string, string>): PluginContext {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    id: 'orchestrator',
    storage: {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      files: {
        readText: async (path) => files.get(path) ?? null,
        writeText: async (path, content) => {
          files.set(path, content);
        },
        delete: async (path) => {
          files.delete(path);
        },
        list: async (prefix = '') => Array.from(files.keys()).filter((path) => path.startsWith(prefix)),
      },
    },
    permissions: {
      check: () => true,
      request: async () => true,
    },
    commands: {
      register: () => ({ dispose: () => {} }),
      execute: async () => {
        throw new Error('not implemented in test');
      },
      start: async () => {
        throw new Error('not implemented in test');
      },
    },
    events: {
      on: (event, handler) => {
        handlers.set(event, handler);
        return { dispose: () => handlers.delete(event) };
      },
      emit: (event, payload) => {
        handlers.get(event)?.(payload);
      },
    },
    tasks: {
      start: (input) => ({
        id: input.id || 'task',
        pluginId: 'orchestrator',
        title: input.title,
        status: 'running',
        detail: input.detail,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      }),
      update: () => {},
      complete: () => {},
      fail: () => {},
    },
    ui: {
      activityBar: { register: () => ({ dispose: () => {} }) },
      leftPanel: { register: () => ({ dispose: () => {} }) },
      workbench: {
        register: () => ({ dispose: () => {} }),
        open: () => {},
      },
      overlay: {
        register: () => ({ dispose: () => {} }),
        open: () => {},
        close: () => {},
      },
      messageActions: { register: () => ({ dispose: () => {} }) },
      toolResultActions: { register: () => ({ dispose: () => {} }) },
      settings: { register: () => ({ dispose: () => {} }) },
    },
  };
}
