import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '@/plugin/sdk';
import { launchAgentSession } from '../../plugins/orchestrator/src/agentSessionRuntime';
import { applyOrchestratorDecision, completeOrchestratorTask, failOrchestratorTask, listReviewedArtifacts, overrideReviewDecision, pauseOrchestratorRun, recoverOrchestratorRun, resumeOrchestratorRun, retryOrchestratorTask, startOrchestratorRun, wakeRunById } from '../../plugins/orchestrator/src/runtime';
import { getProjectState, getRun, listAgentRunsForRun, listArtifactsForRun, listCoordinatorRunsForRun, listTasksForRun, saveAgentRun, saveArtifact, saveReviewPolicy, saveRun, saveTask, updateTask } from '../../plugins/orchestrator/src/storage';
import { createRunFromPlan } from '../../plugins/orchestrator/src/utils';
import type { OrchestrationDecision, OrchestratorConfirmedPlan, OrchestratorReviewLog, OrchestratorRun } from '../../plugins/orchestrator/src/types';

const mockSessionState = {
  sessions: new Map(),
  composerControls: {
    providerId: 'openai',
    modelName: 'gpt-5.4',
    reasoning: 'medium' as const,
    fullAuto: true,
  },
};

vi.mock('../../plugins/orchestrator/src/agentSessionRuntime', () => ({
  interruptAgentSession: vi.fn(async () => {}),
  isAgentSessionActive: vi.fn(() => false),
  launchAgentSession: vi.fn(async (input: { onStarted?: () => Promise<void> | void }) => {
    await input.onStarted?.();
  }),
}));

vi.mock('../shared/state/useSessionStore', () => ({
  useSessionStore: {
    getState: () => mockSessionState,
  },
}));

function unwrapRun(result: OrchestratorRun | { run: OrchestratorRun; reviewLog: OrchestratorReviewLog }) {
  return 'run' in result ? result.run : result;
}

function setAssistantSessionText(sessionId: string, content: string) {
  mockSessionState.sessions.set(sessionId, {
    id: sessionId,
    messages: [
      {
        id: `${sessionId}-assistant`,
        role: 'assistant',
        content: null,
        segments: [
          {
            type: 'text',
            content,
          },
        ],
        status: 'completed',
      },
    ],
  });
}

describe('orchestrator runtime', () => {
  let files = new Map<string, string>();
  let ctx: PluginContext;

  beforeEach(() => {
    files = new Map();
    ctx = createMockContext(files);
    mockSessionState.sessions = new Map();
    vi.mocked(launchAgentSession).mockClear();
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

  it('seeds stage tasks from review policy instead of hard-coding review and human gates', async () => {
    const now = Date.now();
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_policy_seed',
      title: 'Policy Seed Test',
      goal: 'Respect stage review policy.',
      overview: 'Use stored stage policies when seeding tasks.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Policy drives legal transitions.'],
      humanCheckpoints: ['Human approves stage 1 before work starts.'],
      reviewCheckpoints: ['Only stage 2 requires review.'],
      reviewPolicy: 'Stored review policy is the source of truth.',
      confirmedAt: now,
      revision: 1,
      stages: [
        {
          id: 'stage_policy_1',
          name: 'Stage 1',
          goal: 'Wait for a human checkpoint first.',
          deliverables: ['checkpointed result'],
          targetFolder: 'orchestrator-output/stage-policy-1',
          outputFiles: ['stage-1.md'],
        },
        {
          id: 'stage_policy_2',
          name: 'Stage 2',
          goal: 'Require review after work.',
          deliverables: ['reviewed result'],
          targetFolder: 'orchestrator-output/stage-policy-2',
          outputFiles: ['stage-2.md'],
        },
      ],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await saveRun(ctx, run);
    await saveReviewPolicy(ctx, {
      runId: run.id,
      defaultRequiresReview: false,
      allowHumanOverride: true,
      stagePolicies: [
        {
          stageId: 'stage_policy_1',
          stageName: 'Stage 1',
          requiresReview: false,
          humanCheckpointRequired: true,
        },
        {
          stageId: 'stage_policy_2',
          stageName: 'Stage 2',
          requiresReview: true,
          humanCheckpointRequired: false,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    await startOrchestratorRun(ctx, run);

    const tasks = await listTasksForRun(ctx, run.id);
    const firstStage = tasks.find((task) => task.stageId === 'stage_policy_1');
    const secondStage = tasks.find((task) => task.stageId === 'stage_policy_2');
    expect(firstStage?.reviewRequired).toBe(false);
    expect(firstStage?.requiresHumanApproval).toBe(true);
    expect(firstStage?.status).toBe('waiting_human');
    expect(secondStage?.reviewRequired).toBe(true);
    expect(secondStage?.status).toBe('pending');
  });

  it('does not start a coordinator when the run immediately hits a human checkpoint', async () => {
    const now = Date.now();
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_initial_human_gate',
      title: 'Initial Human Gate',
      goal: 'Wait for approval before orchestration starts.',
      overview: 'Human gate should stop wake-up before coordinator launch.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Human checkpoints are hard gates.'],
      humanCheckpoints: ['Human approves Stage 1.'],
      reviewCheckpoints: [],
      reviewPolicy: 'Wait for human approval first.',
      confirmedAt: now,
      revision: 1,
      stages: [
        {
          id: 'stage_gate',
          name: 'Stage Gate',
          goal: 'Wait here.',
          deliverables: ['approved-result'],
          targetFolder: 'orchestrator-output/stage-gate',
          outputFiles: ['approved.md'],
        },
      ],
    };
    const run = createRunFromPlan(plan, 'workbench');
    await saveRun(ctx, run);
    await saveReviewPolicy(ctx, {
      runId: run.id,
      defaultRequiresReview: true,
      allowHumanOverride: true,
      stagePolicies: [{
        stageId: 'stage_gate',
        stageName: 'Stage Gate',
        requiresReview: true,
        humanCheckpointRequired: true,
      }],
      createdAt: now,
      updatedAt: now,
    });

    const started = await startOrchestratorRun(ctx, run);

    expect(started.status).toBe('waiting_human');
    expect((await listCoordinatorRunsForRun(ctx, run.id))).toHaveLength(0);
  });

  it('resumes a human-gated stage by clearing the task gate and waking the coordinator', async () => {
    const now = Date.now();
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_resume_human_gate',
      title: 'Resume Human Gate',
      goal: 'Resume after explicit approval.',
      overview: 'Human checkpoint should release the blocked stage.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Human checkpoints must have an approval path.'],
      humanCheckpoints: ['Human approves Stage 1.'],
      reviewCheckpoints: [],
      reviewPolicy: 'Wait for human approval first.',
      confirmedAt: now,
      revision: 1,
      stages: [{
        id: 'stage_gate_resume',
        name: 'Stage Gate',
        goal: 'Wait here first.',
        deliverables: ['approved-result'],
        targetFolder: 'orchestrator-output/stage-gate',
        outputFiles: ['approved.md'],
      }],
    };
    const run = createRunFromPlan(plan, 'workbench');
    await saveRun(ctx, run);
    await saveReviewPolicy(ctx, {
      runId: run.id,
      defaultRequiresReview: true,
      allowHumanOverride: true,
      stagePolicies: [{
        stageId: 'stage_gate_resume',
        stageName: 'Stage Gate',
        requiresReview: true,
        humanCheckpointRequired: true,
      }],
      createdAt: now,
      updatedAt: now,
    });

    const started = await startOrchestratorRun(ctx, run);
    expect(started.status).toBe('waiting_human');

    const resumed = await resumeOrchestratorRun(ctx, { runId: run.id });
    const tasks = await listTasksForRun(ctx, run.id);
    const stageTask = tasks.find((task) => task.stageId === 'stage_gate_resume' && task.nodeType === 'container');
    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);

    expect(resumed.status).toBe('running');
    expect(stageTask?.status).toBe('ready');
    expect(stageTask?.requiresHumanApproval).toBe(false);
    expect(coordinatorRuns).toHaveLength(1);
  });

  it('resumes a waiting-human rework task even when no agent run exists yet', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_resume_rework',
        title: 'Resume Rework',
        goal: 'Resume the approved rework task.',
        overview: 'Rework approval should create a runnable agent session.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Human approval should unblock rework directly.'],
        humanCheckpoints: [],
        reviewCheckpoints: ['Review before proceeding.'],
        reviewPolicy: 'Review and then rework if needed.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_rework_resume',
          name: 'Rework Stage',
          goal: 'Produce the corrected file.',
          deliverables: ['doc'],
          targetFolder: 'orchestrator-output/rework-stage',
          outputFiles: ['doc.md'],
        }],
      }, 'workbench'),
      status: 'waiting_human' as const,
      pendingHumanCheckpoint: 'Please apply the requested rework.',
      pendingHumanAction: {
        kind: 'rework_approval' as const,
        summary: 'Please apply the requested rework.',
        taskId: 'task_rework_child',
        requestedAt: now,
      },
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_rework_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_rework_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      assignedAgentType: 'orchestrator',
      retryPolicy: 'manual',
      stageId: 'stage_rework_resume',
      planStageId: 'stage_rework_resume',
      stageName: 'Rework Stage',
      title: 'Rework Stage',
      status: 'waiting_human',
      reviewRequired: true,
      targetFolder: 'orchestrator-output/rework-stage',
      expectedFiles: ['doc.md'],
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_rework_child',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_rework_parent',
      rootTaskId: 'task_rework_parent',
      depth: 1,
      order: 1,
      source: 'rework',
      attemptCount: 0,
      assignedAgentType: 'work',
      retryPolicy: 'manual',
      stageId: 'stage_rework_resume',
      planStageId: 'stage_rework_resume',
      stageName: 'Rework Stage',
      agentId: 'stage_rework_resume:work',
      agentName: 'Rework Agent',
      title: 'Rework task',
      status: 'waiting_human',
      objective: 'Apply the review feedback.',
      inputs: ['artifact_feedback'],
      expectedOutputs: ['doc.md'],
      reviewRequired: true,
      blockedReason: 'Apply the review feedback.',
      targetFolder: 'orchestrator-output/rework-stage',
      expectedFiles: ['doc.md'],
      summary: 'Apply the review feedback.',
      failurePolicy: 'pause',
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_feedback',
      runId: run.id,
      agentRunId: 'agent_feedback',
      taskId: 'task_rework_child',
      stageId: 'stage_rework_resume',
      stageName: 'Rework Stage',
      name: 'Feedback artifact',
      logicalKey: 'stage_rework_resume.feedback',
      status: 'rejected',
      version: 1,
      kind: 'report',
      format: 'markdown',
      filePaths: ['orchestrator-output/rework-stage/doc.md'],
      summary: 'Feedback to apply',
      content: 'Fix the file.',
      createdAt: now,
      updatedAt: now,
    });

    const resumed = await resumeOrchestratorRun(ctx, { runId: run.id });
    const tasks = await listTasksForRun(ctx, run.id);
    const reworkTask = tasks.find((task) => task.id === 'task_rework_child');
    const agentRuns = await listAgentRunsForRun(ctx, run.id);

    expect(resumed.status).toBe('running');
    expect(reworkTask?.status).toBe('running');
    expect(agentRuns).toHaveLength(1);
  });

  it('settles pause_requested into paused when the active coordinator interrupt finishes', async () => {
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_pause_interrupt',
      title: 'Pause Interrupt Plan',
      goal: 'Pause cleanly after interrupting the coordinator.',
      overview: 'Coordinator interruption should settle the run state.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Pause should converge to a stable state.'],
      humanCheckpoints: [],
      reviewCheckpoints: [],
      reviewPolicy: 'Review every stage.',
      confirmedAt: Date.now(),
      stages: [{
        id: 'stage_pause_interrupt',
        name: 'Stage 1',
        goal: 'Prepare the first decision.',
        deliverables: ['stage-1.md'],
        targetFolder: 'orchestrator-output/stage-pause-interrupt',
        outputFiles: ['stage-1.md'],
      }],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await startOrchestratorRun(ctx, run);
    const coordinatorLaunch = vi.mocked(launchAgentSession).mock.calls[0]?.[0];
    expect(coordinatorLaunch).toBeTruthy();

    const pauseRequested = await pauseOrchestratorRun(ctx, { runId: run.id });
    expect(pauseRequested.status).toBe('pause_requested');

    await coordinatorLaunch!.onInterrupted?.();

    const pausedRun = await getRun(ctx, run.id);
    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);
    expect(pausedRun?.status).toBe('paused');
    expect(pausedRun?.activeTaskCount).toBe(0);
    expect(coordinatorRuns[0]?.status).toBe('paused');
  });

  it('fails closed when the coordinator attempts tool usage instead of returning a decision', async () => {
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_coordinator_policy',
      title: 'Coordinator Policy Plan',
      goal: 'Fail if the coordinator tries to act like a worker.',
      overview: 'Coordinator should return a decision, not use tools.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Coordinator must stay inside orchestration mode.'],
      humanCheckpoints: [],
      reviewCheckpoints: [],
      reviewPolicy: 'Review every stage.',
      confirmedAt: Date.now(),
      stages: [{
        id: 'stage_coordinator_policy',
        name: 'Stage 1',
        goal: 'Prepare the first decision.',
        deliverables: ['stage-1.md'],
        targetFolder: 'orchestrator-output/stage-coordinator-policy',
        outputFiles: ['stage-1.md'],
      }],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await startOrchestratorRun(ctx, run);
    const coordinatorLaunch = vi.mocked(launchAgentSession).mock.calls[0]?.[0];
    expect(coordinatorLaunch).toBeTruthy();

    await coordinatorLaunch!.onChunk?.({
      type: 'tool_start',
      sessionId: coordinatorLaunch!.sessionId,
      toolId: 'tool_shell',
      toolName: 'shell',
      args: { command: 'echo bad' },
    });
    await coordinatorLaunch!.onInterrupted?.();

    const failedRun = await getRun(ctx, run.id);
    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);
    expect(failedRun?.status).toBe('paused');
    expect(failedRun?.activeTaskCount).toBe(0);
    expect(failedRun?.failureState?.summary).toContain('forbidden tool usage');
    expect(coordinatorRuns[0]?.status).toBe('failed');
    expect(coordinatorRuns[0]?.error).toContain('forbidden tool usage');
  });

  it('launches the coordinator with the dedicated orchestrator profile instead of chat defaults', async () => {
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_coordinator_profile',
      title: 'Coordinator Profile Plan',
      goal: 'Use the configured coordinator profile.',
      overview: 'Coordinator launch should be profile-driven.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Coordinator runtime should come from config.'],
      humanCheckpoints: [],
      reviewCheckpoints: [],
      reviewPolicy: 'Review every stage.',
      confirmedAt: Date.now(),
      stages: [{
        id: 'stage_coordinator_profile',
        name: 'Stage 1',
        goal: 'Prepare the first decision.',
        deliverables: ['stage-1.md'],
        targetFolder: 'orchestrator-output/stage-coordinator-profile',
        outputFiles: ['stage-1.md'],
      }],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await startOrchestratorRun(ctx, run);

    const coordinatorLaunch = vi.mocked(launchAgentSession).mock.calls[0]?.[0];
    expect(coordinatorLaunch?.profileId).toBe('orchestrator-coordinate');
    expect(coordinatorLaunch?.allowedTools).toBeUndefined();
  });

  it('launches resumed rework with the dedicated work profile', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_rework_profile',
        title: 'Rework Profile Plan',
        goal: 'Resume rework with the configured work profile.',
        overview: 'Rework relaunch should be profile-driven.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Work sessions should come from config.'],
        humanCheckpoints: [],
        reviewCheckpoints: ['Review before proceeding.'],
        reviewPolicy: 'Review and then rework if needed.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_rework_profile',
          name: 'Rework Stage',
          goal: 'Produce the corrected file.',
          deliverables: ['doc'],
          targetFolder: 'orchestrator-output/rework-profile',
          outputFiles: ['doc.md'],
        }],
      }, 'workbench'),
      status: 'waiting_human' as const,
      pendingHumanCheckpoint: 'Please apply the requested rework.',
      pendingHumanAction: {
        kind: 'rework_approval' as const,
        summary: 'Please apply the requested rework.',
        taskId: 'task_rework_profile_child',
        requestedAt: now,
      },
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_rework_profile_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_rework_profile_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      assignedAgentType: 'orchestrator',
      retryPolicy: 'manual',
      stageId: 'stage_rework_profile',
      planStageId: 'stage_rework_profile',
      stageName: 'Rework Stage',
      title: 'Rework Stage',
      status: 'waiting_human',
      reviewRequired: true,
      targetFolder: 'orchestrator-output/rework-profile',
      expectedFiles: ['doc.md'],
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_rework_profile_child',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_rework_profile_parent',
      rootTaskId: 'task_rework_profile_parent',
      depth: 1,
      order: 1,
      source: 'rework',
      attemptCount: 0,
      assignedAgentType: 'work',
      retryPolicy: 'manual',
      stageId: 'stage_rework_profile',
      planStageId: 'stage_rework_profile',
      stageName: 'Rework Stage',
      agentId: 'stage_rework_profile:work',
      agentName: 'Rework Agent',
      title: 'Rework task',
      status: 'waiting_human',
      objective: 'Apply the review feedback.',
      inputs: ['artifact_rework_profile_feedback'],
      expectedOutputs: ['doc.md'],
      reviewRequired: true,
      blockedReason: 'Apply the review feedback.',
      targetFolder: 'orchestrator-output/rework-profile',
      expectedFiles: ['doc.md'],
      summary: 'Apply the review feedback.',
      failurePolicy: 'pause',
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_rework_profile_feedback',
      runId: run.id,
      agentRunId: 'agent_feedback',
      taskId: 'task_rework_profile_child',
      stageId: 'stage_rework_profile',
      stageName: 'Rework Stage',
      name: 'Feedback artifact',
      logicalKey: 'stage_rework_profile.feedback',
      status: 'rejected',
      version: 1,
      kind: 'report',
      format: 'markdown',
      filePaths: ['orchestrator-output/rework-profile/doc.md'],
      summary: 'Feedback to apply',
      content: 'Fix the file.',
      createdAt: now,
      updatedAt: now,
    });

    await resumeOrchestratorRun(ctx, { runId: run.id });

    const workLaunch = vi.mocked(launchAgentSession).mock.calls
      .map((call) => call[0])
      .find((call) => call.profileId === 'orchestrator-work');
    expect(workLaunch?.profileId).toBe('orchestrator-work');
    expect(workLaunch?.allowedTools).toBeUndefined();
  });


  it('verifies workspace files before promoting a work result into an artifact', async () => {
    const now = Date.now();
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rhythm-orchestrator-'));
    const outputDir = path.join(workspacePath, 'orchestrator-output', 'verified-stage');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'result.md'), '# Verified Result\n\nfrom disk', 'utf8');

    const run = {
      ...createRunFromPlan({
        id: 'plan_verified_artifact',
        title: 'Verified Artifact Plan',
        goal: 'Use filesystem state as artifact truth.',
        overview: 'Artifact verification test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Accepted artifacts must come from verified files.'],
        humanCheckpoints: [],
        reviewCheckpoints: ['Review before continue.'],
        reviewPolicy: 'Review after verified work.',
        confirmedAt: now,
        revision: 1,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
      executionContext: {
        workspacePath,
        capturedAt: now,
      },
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_verified_work',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      rootTaskId: 'task_verified_work',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      latestAgentRunId: 'agent_run_verified_work',
      attemptCount: 1,
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Verified Stage',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      title: 'Verified work task',
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });
    await saveAgentRun(ctx, {
      id: 'agent_run_verified_work',
      runId: run.id,
      taskId: 'task_verified_work',
      planId: run.planId,
      kind: 'work',
      stageId: 'stage_1',
      stageName: 'Verified Stage',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      sessionId: 'session_verified_work',
      title: 'Work Agent',
      prompt: 'prompt',
      input: {
        assignmentBrief: {
          assignmentId: 'assignment_verified_work',
          runId: run.id,
          taskId: 'task_verified_work',
          kind: 'work',
          title: 'Verified Assignment',
          whyNow: 'Write the verified file.',
          goal: 'Write the verified file.',
          context: [],
          inputArtifacts: [],
          instructions: [],
          acceptanceCriteria: [],
          deliverables: ['result'],
          targetFolder: 'orchestrator-output/verified-stage',
          expectedFiles: ['result.md'],
          reviewTargetPaths: ['orchestrator-output/verified-stage/result.md'],
          reviewFocus: [],
          risks: [],
          createdAt: now,
        },
        runGoal: run.goal,
        planTitle: run.planTitle,
        stageId: 'stage_1',
        stageName: 'Verified Stage',
        constraints: [],
        targetFolder: 'orchestrator-output/verified-stage',
        expectedFiles: ['result.md'],
        acceptedArtifactSummaries: [],
        recentReviewSummaries: [],
        projectStateSummary: [],
      },
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });

    await completeOrchestratorTask(ctx, { taskId: 'task_verified_work' });

    const artifacts = await listArtifactsForRun(ctx, run.id);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].filePaths).toEqual(['orchestrator-output/verified-stage/result.md']);
    expect(artifacts[0].content).toContain('from disk');
    expect(artifacts[0].summary).toContain('Verified Result');

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('applies concurrent task updates atomically', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_atomic_update',
        title: 'Atomic Update Plan',
        goal: 'Avoid lost task updates.',
        overview: 'Atomic task update test.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Task updates must serialize.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        revision: 1,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_atomic',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      rootTaskId: 'task_atomic',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      title: 'Atomic Task',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    });

    await Promise.all([
      updateTask(ctx, 'task_atomic', (current) => ({ ...current, attemptCount: current.attemptCount + 1 })),
      updateTask(ctx, 'task_atomic', (current) => ({ ...current, attemptCount: current.attemptCount + 1 })),
    ]);

    const task = (await listTasksForRun(ctx, run.id)).find((entry) => entry.id === 'task_atomic');
    expect(task?.attemptCount).toBe(2);
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
    await saveTask(ctx, {
      id: 'task_work_for_override_changes',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_parent',
      rootTaskId: 'task_parent',
      depth: 1,
      order: 0,
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await saveArtifact(ctx, {
      id: 'artifact_override_changes',
      runId: run.id,
      agentRunId: 'agent_work_for_override_changes',
      taskId: 'task_work_for_override_changes',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:work',
      agentName: 'Work Agent',
      name: 'Draft Output',
      logicalKey: 'stage_1.work.override_changes',
      status: 'review_submitted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/stage-1/output.md'],
      summary: 'Draft output to revise',
      content: 'draft content',
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

  it('keeps the next root stage waiting_human when its stage policy requires approval', async () => {
    const now = Date.now();
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_next_stage_gate',
      title: 'Next Stage Gate',
      goal: 'Do not auto-unlock gated stages.',
      overview: 'Unlocking the next stage must respect stage policy.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Stage unlocks still respect human checkpoints.'],
      humanCheckpoints: ['Human approves Stage 2.'],
      reviewCheckpoints: ['Stage 1 review required.'],
      reviewPolicy: 'Stage 2 waits for approval.',
      confirmedAt: now,
      revision: 1,
      stages: [
        {
          id: 'stage_one',
          name: 'Stage 1',
          goal: 'Finish stage one.',
          deliverables: ['one'],
          targetFolder: 'orchestrator-output/stage-one',
          outputFiles: ['one.md'],
        },
        {
          id: 'stage_two',
          name: 'Stage 2',
          goal: 'Wait for approval before stage two.',
          deliverables: ['two'],
          targetFolder: 'orchestrator-output/stage-two',
          outputFiles: ['two.md'],
        },
      ],
    };
    const run = {
      ...createRunFromPlan(plan, 'workbench'),
      status: 'waiting_human' as const,
    };
    await saveRun(ctx, run);
    await saveReviewPolicy(ctx, {
      runId: run.id,
      defaultRequiresReview: true,
      allowHumanOverride: true,
      stagePolicies: [
        {
          stageId: 'stage_one',
          stageName: 'Stage 1',
          requiresReview: true,
          humanCheckpointRequired: false,
        },
        {
          stageId: 'stage_two',
          stageName: 'Stage 2',
          requiresReview: true,
          humanCheckpointRequired: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_stage_one',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_stage_one',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_one',
      planStageId: 'stage_one',
      stageName: 'Stage 1',
      title: 'Stage 1',
      status: 'waiting_review',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_stage_two',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_stage_two',
      depth: 0,
      order: 1,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_two',
      planStageId: 'stage_two',
      stageName: 'Stage 2',
      title: 'Stage 2',
      status: 'pending',
      reviewRequired: true,
      requiresHumanApproval: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_stage_one_work',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_stage_one',
      rootTaskId: 'task_stage_one',
      depth: 1,
      order: 1,
      source: 'plan_seed',
      attemptCount: 1,
      stageId: 'stage_one',
      planStageId: 'stage_one',
      stageName: 'Stage 1',
      title: 'Stage 1 Work',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_stage_one_review',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: 'task_stage_one',
      rootTaskId: 'task_stage_one',
      depth: 1,
      order: 2,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_one',
      planStageId: 'stage_one',
      stageName: 'Stage 1',
      title: 'Stage 1 review',
      status: 'waiting_human',
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_stage_one',
      runId: run.id,
      agentRunId: 'agent_stage_one',
      taskId: 'task_stage_one_work',
      stageId: 'stage_one',
      stageName: 'Stage 1',
      name: 'Stage One Draft',
      logicalKey: 'stage_one.work',
      status: 'review_submitted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/stage-one/one.md'],
      summary: 'Stage one draft',
      content: 'draft',
      createdAt: now,
      updatedAt: now,
    });

    await overrideReviewDecision(ctx, {
      taskId: 'task_stage_one_review',
      decision: 'approved',
      feedback: 'Approved.',
    });

    const nextStage = (await listTasksForRun(ctx, run.id)).find((task) => task.id === 'task_stage_two');
    const updatedRun = await getRun(ctx, run.id);
    expect(nextStage?.status).toBe('waiting_human');
    expect(updatedRun?.status).toBe('waiting_human');
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

  it('requires structured JSON review output and persists review details', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_structured_review',
        title: 'Structured Review Plan',
        goal: 'Persist structured review output.',
        overview: 'Review should be parsed from JSON.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Review gates are structured.'],
        humanCheckpoints: [],
        reviewCheckpoints: ['Review before continue.'],
        reviewPolicy: 'Require review.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
      activeTaskCount: 1,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_structured_review',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_structured_review',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      assignedAgentType: 'orchestrator',
      retryPolicy: 'manual',
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
      id: 'task_work_structured_review',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_parent_structured_review',
      rootTaskId: 'task_parent_structured_review',
      depth: 1,
      order: 1,
      source: 'plan_seed',
      attemptCount: 1,
      assignedAgentType: 'work',
      retryPolicy: 'auto_transient',
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      title: 'Work task',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_review_structured_review',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: 'task_parent_structured_review',
      rootTaskId: 'task_parent_structured_review',
      depth: 1,
      order: 2,
      source: 'orchestrator_split',
      attemptCount: 1,
      assignedAgentType: 'review',
      retryPolicy: 'auto_transient',
      stageId: 'stage_1',
      planStageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:review',
      agentName: 'Review Agent',
      title: 'Review task',
      status: 'running',
      sessionId: 'session_structured_review',
      createdAt: now,
      updatedAt: now,
    });
    await saveAgentRun(ctx, {
      id: 'agent_run_structured_review',
      runId: run.id,
      taskId: 'task_review_structured_review',
      planId: run.planId,
      kind: 'review',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      agentId: 'stage_1:review',
      agentName: 'Review Agent',
      sessionId: 'session_structured_review',
      title: 'Review Agent',
      prompt: 'prompt',
      input: {
        assignmentBrief: {
          assignmentId: 'assignment_structured_review',
          runId: run.id,
          taskId: 'task_parent_structured_review',
          kind: 'review',
          title: 'Structured Review',
          whyNow: 'Review the draft.',
          goal: 'Review the draft.',
          context: [],
          inputArtifacts: [],
          instructions: [],
          acceptanceCriteria: [],
          deliverables: ['draft'],
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
        reviewedTaskId: 'task_parent_structured_review',
        reviewedArtifactIds: ['artifact_structured_review'],
        reviewedArtifactSummaries: ['Draft output'],
        reviewedArtifactPaths: ['orchestrator-output/stage-1/output.md'],
        reviewedArtifactContents: ['draft content'],
        projectStateSummary: [],
      },
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_structured_review',
      runId: run.id,
      agentRunId: 'agent_work_structured_review',
      taskId: 'task_work_structured_review',
      stageId: 'stage_1',
      stageName: 'Stage 1',
      name: 'Draft Output',
      logicalKey: 'stage_1.work.structured_review',
      status: 'review_submitted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/stage-1/output.md'],
      summary: 'Draft output',
      content: 'draft content',
      createdAt: now,
      updatedAt: now,
    });
    mockSessionState.sessions.set('session_structured_review', {
      id: 'session_structured_review',
      title: 'Structured Review Session',
      updatedAt: now,
      messages: [{
        id: 'assistant_review_message',
        role: 'assistant',
        createdAt: now,
        segments: [{
          type: 'text',
          content: '{"decision":"approved","summary":"Looks good.","issues":[],"requiredRework":[],"confidence":0.93}',
        }],
      }],
    });

    await completeOrchestratorTask(ctx, { taskId: 'task_review_structured_review' });

    const reviewLogs = JSON.parse(files.get(`data/runs/${run.id}/review-logs.json`) || '[]');
    expect(reviewLogs[0].decision).toBe('approved');
    expect(reviewLogs[0].confidence).toBe(0.93);
    expect(reviewLogs[0].requiredRework).toEqual([]);
    expect((await getRun(ctx, run.id))?.metrics?.reviewCount).toBe(1);
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

  it('rejects human review override when no reviewed artifacts are attached', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_override_without_artifacts',
        title: 'Override Requires Artifacts',
        goal: 'Human override must target reviewed artifacts.',
        overview: 'Prevent empty approval overrides.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Review override requires concrete submitted artifacts.'],
        humanCheckpoints: ['A human may override only an actual review submission.'],
        reviewCheckpoints: ['Review before continue.'],
        reviewPolicy: 'Require review.',
        confirmedAt: now,
        stages: [],
      }, 'workbench'),
      status: 'waiting_human' as const,
      pendingHumanCheckpoint: 'Review this stage manually.',
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_parent_no_artifacts',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_parent_no_artifacts',
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
      id: 'task_review_no_artifacts',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: 'task_parent_no_artifacts',
      rootTaskId: 'task_parent_no_artifacts',
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
      status: 'waiting_human',
      createdAt: now,
      updatedAt: now,
    });

    await expect(overrideReviewDecision(ctx, {
      taskId: 'task_review_no_artifacts',
      decision: 'approved',
      feedback: 'Approve without artifacts.',
    })).rejects.toThrow('Cannot override review without reviewed artifacts attached to the stage.');

    const updatedRun = await getRun(ctx, run.id);
    const tasks = await listTasksForRun(ctx, run.id);
    const reviewLogs = JSON.parse(files.get(`data/runs/${run.id}/review-logs.json`) || '[]');
    expect(updatedRun?.status).toBe('waiting_human');
    expect(tasks.find((task) => task.id === 'task_review_no_artifacts')?.status).toBe('waiting_human');
    expect(tasks.find((task) => task.id === 'task_parent_no_artifacts')?.status).toBe('waiting_review');
    expect(reviewLogs).toHaveLength(0);
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
      status: 'throttle',
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
    await saveTask(ctx, {
      id: 'task_work_rejected',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_parent_rejected',
      rootTaskId: 'task_parent_rejected',
      depth: 1,
      order: 0,
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
      id: 'artifact_rejected',
      runId: run.id,
      agentRunId: 'agent_work_rejected',
      taskId: 'task_work_rejected',
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

  it('relaunches in-flight agent sessions during recovery when persisted tasks were still running', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_recover_running_task',
        title: 'Recover Running Task',
        goal: 'Resume running task after restart.',
        overview: 'Recovery should relaunch detached task sessions.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Recovery must restore in-flight work.'],
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
      id: 'task_recover_running',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      rootTaskId: 'task_recover_running',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 1,
      assignedAgentType: 'work',
      retryPolicy: 'auto_transient',
      title: 'Recoverable task',
      status: 'running',
      sessionId: 'session_recover_running',
      createdAt: now,
      updatedAt: now,
    });
    await saveAgentRun(ctx, {
      id: 'agent_run_recover_running',
      runId: run.id,
      taskId: 'task_recover_running',
      planId: run.planId,
      kind: 'work',
      sessionId: 'session_recover_running',
      title: 'Recover Agent',
      prompt: 'resume prompt',
      input: {
        assignmentBrief: {
          assignmentId: 'assignment_recover_running',
          runId: run.id,
          taskId: 'task_recover_running',
          kind: 'work',
          title: 'Recover task',
          whyNow: 'Resume after restart.',
          goal: 'Continue the task.',
          context: [],
          inputArtifacts: [],
          instructions: [],
          acceptanceCriteria: [],
          deliverables: ['result'],
          targetFolder: 'orchestrator-output/recover',
          expectedFiles: ['result.md'],
          reviewTargetPaths: ['orchestrator-output/recover/result.md'],
          reviewFocus: [],
          risks: [],
          createdAt: now,
        },
        runGoal: run.goal,
        planTitle: run.planTitle,
        constraints: [],
        targetFolder: 'orchestrator-output/recover',
        expectedFiles: ['result.md'],
        acceptedArtifactSummaries: [],
        recentReviewSummaries: [],
        projectStateSummary: [],
      },
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });

    await recoverOrchestratorRun(ctx, run.id);

    expect(vi.mocked(launchAgentSession)).toHaveBeenCalled();
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
    expect((result as { task?: { status?: string } | null }).task?.status ?? null).toBe('ready');
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

  it('passes artifact snapshot content to review instead of relying on mutable workspace files', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_review_snapshot',
        title: 'Review Snapshot Plan',
        goal: 'Review frozen artifact snapshots.',
        overview: 'Review input should include artifact content.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Review the artifact snapshot, not the moving workspace.'],
        humanCheckpoints: [],
        reviewCheckpoints: ['Review after work.'],
        reviewPolicy: 'Review the snapshot.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_snapshot',
          name: 'Snapshot Stage',
          goal: 'Review a frozen artifact.',
          deliverables: ['snapshot'],
          targetFolder: 'orchestrator-output/snapshot-stage',
          outputFiles: ['snapshot.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      currentStageId: 'stage_snapshot',
      currentStageName: 'Snapshot Stage',
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_snapshot_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_snapshot_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_snapshot',
      planStageId: 'stage_snapshot',
      stageName: 'Snapshot Stage',
      title: 'Snapshot Stage',
      status: 'waiting_review',
      reviewRequired: true,
      targetFolder: 'orchestrator-output/snapshot-stage',
      expectedFiles: ['snapshot.md'],
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_snapshot_work',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_snapshot_parent',
      rootTaskId: 'task_snapshot_parent',
      depth: 1,
      order: 1,
      source: 'plan_seed',
      attemptCount: 1,
      stageId: 'stage_snapshot',
      planStageId: 'stage_snapshot',
      stageName: 'Snapshot Stage',
      title: 'Snapshot Work',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_snapshot',
      runId: run.id,
      agentRunId: 'agent_snapshot',
      taskId: 'task_snapshot_work',
      stageId: 'stage_snapshot',
      stageName: 'Snapshot Stage',
      name: 'Snapshot Artifact',
      logicalKey: 'stage_snapshot.work',
      status: 'draft',
      version: 1,
      kind: 'report',
      format: 'markdown',
      filePaths: ['orchestrator-output/snapshot-stage/snapshot.md'],
      summary: 'Frozen snapshot',
      content: '# Frozen Snapshot\n\nreview this exact content',
      createdAt: now,
      updatedAt: now,
    });
    files.set(`data/runs/${run.id}/orchestrator-agent-runs.json`, JSON.stringify([{
      schemaVersion: 1,
      id: 'coordinator_snapshot',
      runId: run.id,
      sessionId: 'session_snapshot',
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
        currentStageId: 'stage_snapshot',
        currentStageName: 'Snapshot Stage',
        currentStageTargetFolder: 'orchestrator-output/snapshot-stage',
        currentStageOutputFiles: ['snapshot.md'],
        currentStageReviewableOutputPaths: ['orchestrator-output/snapshot-stage/snapshot.md'],
        currentStageDraftOutputSummaries: ['Snapshot Artifact: Frozen snapshot'],
        currentStageAllowedDispatchKinds: ['review'],
        activeTaskCount: 0,
        availableSlots: 1,
        readyTaskTitles: [],
        blockedTaskTitles: [],
        waitingReviewTaskTitles: ['Snapshot Stage'],
        latestReviewSummaries: [],
        projectStateSummary: [],
        actionableTasks: ['task_snapshot_parent | waiting_review | Snapshot Stage | -'],
        candidateDispatches: ['REVIEW · Snapshot Stage · Snapshot Stage Review Agent · targetFolder=orchestrator-output/snapshot-stage · expectedFiles=snapshot.md'],
      },
      status: 'running',
      createdAt: now,
      updatedAt: now,
    }]));

    await applyOrchestratorDecision(ctx, run.id, 'coordinator_snapshot', {
      status: 'dispatch',
      summary: 'Dispatch review.',
      currentStageId: 'stage_snapshot',
      currentStageName: 'Snapshot Stage',
      currentAgentId: 'stage_snapshot:orchestrator',
      currentAgentName: 'Coordinator',
      taskOperations: [],
      dispatches: [{
        parentTaskId: 'task_snapshot_parent',
        stageId: 'stage_snapshot',
        stageName: 'Snapshot Stage',
        kind: 'review',
        agentId: 'stage_snapshot:review',
        agentName: 'Snapshot Review Agent',
        assignmentBrief: {
          assignmentId: 'assignment_snapshot_review',
          runId: run.id,
          taskId: 'task_snapshot_parent',
          kind: 'review',
          title: 'Snapshot Review',
          whyNow: 'Review the frozen snapshot.',
          goal: 'Review the frozen snapshot.',
          context: [],
          inputArtifacts: [],
          instructions: [],
          acceptanceCriteria: [],
          deliverables: ['snapshot'],
          targetFolder: 'orchestrator-output/snapshot-stage',
          expectedFiles: ['snapshot.md'],
          reviewTargetPaths: ['orchestrator-output/snapshot-stage/snapshot.md'],
          reviewFocus: [],
          risks: [],
          createdAt: now,
        },
      }],
    });

    const agentRuns = await listAgentRunsForRun(ctx, run.id);
    const reviewRun = agentRuns.find((agentRun) => agentRun.kind === 'review');
    expect(reviewRun).toBeTruthy();
    const reviewInput = reviewRun!.input as { reviewedArtifactContents?: string[] };
    expect(reviewInput.reviewedArtifactContents).toEqual(['# Frozen Snapshot\n\nreview this exact content']);
  });

  it('allows create_task to refine outputs within the same stage subtree', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_refine_outputs',
        title: 'Refine Outputs Plan',
        goal: 'Allow legal task decomposition.',
        overview: 'create_task may refine stage outputs.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Coordinator may split work without changing stage semantics.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_refine',
          name: 'Refine Stage',
          goal: 'Produce docs.',
          deliverables: ['docs'],
          targetFolder: 'orchestrator-output/refine-stage',
          outputFiles: ['docs/plan.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      currentStageId: 'stage_refine',
      currentStageName: 'Refine Stage',
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_refine_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_refine_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_refine',
      planStageId: 'stage_refine',
      stageName: 'Refine Stage',
      title: 'Refine Stage',
      status: 'ready',
      reviewRequired: false,
      targetFolder: 'orchestrator-output/refine-stage',
      expectedFiles: ['docs/plan.md'],
      createdAt: now,
      updatedAt: now,
    });
    files.set(`data/runs/${run.id}/orchestrator-agent-runs.json`, JSON.stringify([{
      schemaVersion: 1,
      id: 'coordinator_refine',
      runId: run.id,
      sessionId: 'session_refine',
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
        currentStageId: 'stage_refine',
        currentStageName: 'Refine Stage',
        currentStageTargetFolder: 'orchestrator-output/refine-stage',
        currentStageOutputFiles: ['docs/plan.md'],
        currentStageReviewableOutputPaths: [],
        currentStageDraftOutputSummaries: [],
        currentStageAllowedDispatchKinds: ['work'],
        activeTaskCount: 0,
        availableSlots: 1,
        readyTaskTitles: ['Refine Stage'],
        blockedTaskTitles: [],
        waitingReviewTaskTitles: [],
        latestReviewSummaries: [],
        projectStateSummary: [],
        actionableTasks: ['task_refine_parent | ready | Refine Stage | -'],
        candidateDispatches: ['WORK · Refine Stage · Refine Stage Work Agent · targetFolder=orchestrator-output/refine-stage · expectedFiles=docs/plan.md'],
      },
      status: 'running',
      createdAt: now,
      updatedAt: now,
    }]));

    await applyOrchestratorDecision(ctx, run.id, 'coordinator_refine', {
      status: 'wait',
      summary: 'Split the docs output.',
      currentStageId: 'stage_refine',
      currentStageName: 'Refine Stage',
      currentAgentId: 'stage_refine:orchestrator',
      currentAgentName: 'Coordinator',
      dispatches: [],
      taskOperations: [{
        type: 'create_task',
        parentTaskId: 'task_refine_parent',
        title: 'Draft docs section',
        targetFolder: 'orchestrator-output/refine-stage/docs',
        expectedFiles: ['plan/section-a.md'],
        note: 'Split the doc into sections.',
      }],
    });

    const tasks = await listTasksForRun(ctx, run.id);
    expect(tasks.some((task) => task.title === 'Draft docs section')).toBe(true);
  });

  it('persists richer orchestration decision audit fields', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_decision_audit',
        title: 'Decision Audit Plan',
        goal: 'Persist richer audit details.',
        overview: 'Decision audit should retain rules and risks.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Audit decisions structurally.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_audit',
          name: 'Audit Stage',
          goal: 'Stay in place.',
          deliverables: ['doc'],
          targetFolder: 'orchestrator-output/audit',
          outputFiles: ['doc.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      currentStageId: 'stage_audit',
      currentStageName: 'Audit Stage',
      orchestrationInput: {
        runGoal: 'Persist richer audit details.',
        planTitle: 'Decision Audit Plan',
        planOverview: 'Decision audit should retain rules and risks.',
        decompositionPrinciples: ['Audit decisions structurally.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No review needed.',
        currentStageId: 'stage_audit',
        currentStageName: 'Audit Stage',
        currentStageTargetFolder: 'orchestrator-output/audit',
        currentStageOutputFiles: ['doc.md'],
        currentStageReviewableOutputPaths: [],
        currentStageDraftOutputSummaries: [],
        currentStageAllowedDispatchKinds: ['work'],
        activeTaskCount: 0,
        availableSlots: 1,
        readyTaskTitles: ['Audit Stage'],
        blockedTaskTitles: [],
        waitingReviewTaskTitles: [],
        latestReviewSummaries: [],
        projectStateSummary: [],
        actionableTasks: ['task_audit_parent | ready | Audit Stage | -'],
        candidateDispatches: ['WORK · Audit Stage · Audit Stage Work Agent · targetFolder=orchestrator-output/audit · expectedFiles=doc.md'],
      },
      currentOrchestratorAgentRunId: 'coordinator_audit',
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_audit_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_audit_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      assignedAgentType: 'orchestrator',
      retryPolicy: 'manual',
      stageId: 'stage_audit',
      planStageId: 'stage_audit',
      stageName: 'Audit Stage',
      title: 'Audit Stage',
      status: 'ready',
      reviewRequired: false,
      targetFolder: 'orchestrator-output/audit',
      expectedFiles: ['doc.md'],
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
      status: 'throttle',
      summary: 'Nothing legal to dispatch yet.',
      ruleHits: ['Current stage only', 'No draft outputs available'],
      risks: ['Dispatching now would be premature'],
      requiresHuman: false,
      currentStageId: 'stage_audit',
      currentStageName: 'Audit Stage',
      currentAgentId: 'stage_audit:orchestrator',
      currentAgentName: 'Coordinator',
      dispatches: [],
      taskOperations: [{
        type: 'wait',
        note: 'Wait for more inputs.',
      }],
    });

    const updatedRun = await getRun(ctx, run.id);
    expect(updatedRun?.orchestrationDecision?.ruleHits).toEqual(['Current stage only', 'No draft outputs available']);
    expect(updatedRun?.orchestrationDecision?.risks).toEqual(['Dispatching now would be premature']);
    expect(updatedRun?.orchestrationDecision?.candidateActionCount).toBe(1);
    expect(updatedRun?.orchestrationDecision?.inputSummary.some((line) => line.includes('Current stage: Audit Stage'))).toBe(true);
  });

  it('keeps sibling artifact lineages distinct inside one stage', async () => {
    const now = Date.now();
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'orchestrator-lineage-'));
    await fs.mkdir(path.join(workspaceRoot, 'orchestrator-output', 'lineage-stage', 'docs'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'orchestrator-output', 'lineage-stage', 'docs', 'a.md'), 'alpha', 'utf8');
    await fs.writeFile(path.join(workspaceRoot, 'orchestrator-output', 'lineage-stage', 'docs', 'b.md'), 'beta', 'utf8');

    const run = {
      ...createRunFromPlan({
        id: 'plan_lineage',
        title: 'Lineage Plan',
        goal: 'Keep sibling deliverables distinct.',
        overview: 'Artifact lineage should be deliverable-scoped.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Sibling outputs must not collapse into one lineage.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'Review only what was produced.',
        confirmedAt: now,
        revision: 1,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
      executionContext: {
        workspacePath: workspaceRoot,
        capturedAt: now,
      },
    };
    await saveRun(ctx, run);

    for (const taskId of ['task_lineage_a', 'task_lineage_b']) {
      const fileName = taskId.endsWith('_a') ? 'a.md' : 'b.md';
      await saveTask(ctx, {
        id: taskId,
        runId: run.id,
        nodeType: 'work',
        kind: 'work',
        parentTaskId: 'task_lineage_parent',
        rootTaskId: 'task_lineage_parent',
        depth: 1,
        order: taskId.endsWith('_a') ? 1 : 2,
        source: 'orchestrator_split',
        attemptCount: 1,
        stageId: 'stage_lineage',
        planStageId: 'stage_lineage',
        stageName: 'Lineage Stage',
        agentId: `stage_lineage:${fileName}`,
        agentName: `Lineage ${fileName}`,
        title: `Write ${fileName}`,
        status: 'running',
        targetFolder: 'orchestrator-output/lineage-stage',
        expectedFiles: [`docs/${fileName}`],
        createdAt: now,
        updatedAt: now,
      });
      await saveAgentRun(ctx, {
        id: `agent_${taskId}`,
        runId: run.id,
        taskId,
        planId: run.planId,
        kind: 'work',
        stageId: 'stage_lineage',
        stageName: 'Lineage Stage',
        agentId: `stage_lineage:${fileName}`,
        agentName: `Lineage ${fileName}`,
        sessionId: `session_${taskId}`,
        title: `Lineage ${fileName}`,
        prompt: 'prompt',
        input: {
          assignmentBrief: {
            assignmentId: `assignment_${taskId}`,
            runId: run.id,
            taskId,
            kind: 'work',
            title: `Write ${fileName}`,
            whyNow: 'Need a distinct deliverable.',
            goal: `Write ${fileName}.`,
            context: [],
            inputArtifacts: [],
            instructions: [],
            acceptanceCriteria: [],
            deliverables: [fileName],
            targetFolder: 'orchestrator-output/lineage-stage',
            expectedFiles: [`docs/${fileName}`],
            reviewTargetPaths: [`orchestrator-output/lineage-stage/docs/${fileName}`],
            reviewFocus: [],
            risks: [],
            createdAt: now,
          },
          runGoal: run.goal,
          planTitle: run.planTitle,
          stageId: 'stage_lineage',
          stageName: 'Lineage Stage',
          constraints: [],
          targetFolder: 'orchestrator-output/lineage-stage',
          expectedFiles: [`docs/${fileName}`],
          acceptedArtifactSummaries: [],
          recentReviewSummaries: [],
          projectStateSummary: [],
        },
        status: 'running',
        createdAt: now,
        updatedAt: now,
      });
    }

    await completeOrchestratorTask(ctx, { taskId: 'task_lineage_a' });
    await completeOrchestratorTask(ctx, { taskId: 'task_lineage_b' });

    const artifacts = await listArtifactsForRun(ctx, run.id);
    const logicalKeys = artifacts.map((artifact) => artifact.logicalKey);
    expect(new Set(logicalKeys).size).toBe(2);
  });

  it('approves only the artifacts that were actually reviewed', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_partial_review',
        title: 'Partial Review Plan',
        goal: 'Only reviewed artifacts become accepted.',
        overview: 'Approval scope must be exact.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Review approval binds to the reviewed artifact set.'],
        humanCheckpoints: [],
        reviewCheckpoints: ['Review specific outputs only.'],
        reviewPolicy: 'Approve only what was attached.',
        confirmedAt: now,
        revision: 1,
        stages: [],
      }, 'workbench'),
      status: 'running' as const,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_partial_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_partial_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_partial',
      planStageId: 'stage_partial',
      stageName: 'Partial Stage',
      title: 'Partial Stage',
      status: 'waiting_review',
      reviewRequired: true,
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_partial_work_a',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_partial_parent',
      rootTaskId: 'task_partial_parent',
      depth: 1,
      order: 1,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_partial',
      planStageId: 'stage_partial',
      stageName: 'Partial Stage',
      title: 'Work A',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_partial_work_b',
      runId: run.id,
      nodeType: 'work',
      kind: 'work',
      parentTaskId: 'task_partial_parent',
      rootTaskId: 'task_partial_parent',
      depth: 1,
      order: 2,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_partial',
      planStageId: 'stage_partial',
      stageName: 'Partial Stage',
      title: 'Work B',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    });
    await saveTask(ctx, {
      id: 'task_partial_review',
      runId: run.id,
      nodeType: 'review',
      kind: 'review',
      parentTaskId: 'task_partial_parent',
      rootTaskId: 'task_partial_parent',
      depth: 1,
      order: 3,
      source: 'orchestrator_split',
      attemptCount: 1,
      stageId: 'stage_partial',
      planStageId: 'stage_partial',
      stageName: 'Partial Stage',
      title: 'Partial Review',
      status: 'ready',
      latestArtifactIds: ['artifact_partial_a'],
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_partial_a',
      runId: run.id,
      agentRunId: 'agent_partial_a',
      taskId: 'task_partial_work_a',
      stageId: 'stage_partial',
      stageName: 'Partial Stage',
      name: 'Artifact A',
      logicalKey: 'stage_partial.work.orchestrator-output/partial|a.md',
      status: 'review_submitted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/partial/a.md'],
      summary: 'A',
      content: 'A',
      createdAt: now,
      updatedAt: now,
    });
    await saveArtifact(ctx, {
      id: 'artifact_partial_b',
      runId: run.id,
      agentRunId: 'agent_partial_b',
      taskId: 'task_partial_work_b',
      stageId: 'stage_partial',
      stageName: 'Partial Stage',
      name: 'Artifact B',
      logicalKey: 'stage_partial.work.orchestrator-output/partial|b.md',
      status: 'review_submitted',
      version: 1,
      kind: 'draft',
      format: 'markdown',
      filePaths: ['orchestrator-output/partial/b.md'],
      summary: 'B',
      content: 'B',
      createdAt: now,
      updatedAt: now,
    });

    await overrideReviewDecision(ctx, {
      taskId: 'task_partial_review',
      decision: 'approved',
      feedback: 'Approve only artifact A.',
    });

    const artifacts = await listArtifactsForRun(ctx, run.id);
    const projectState = await getProjectState(ctx, run.id);
    expect(artifacts.find((artifact) => artifact.id === 'artifact_partial_a')?.status).toBe('accepted');
    expect(artifacts.find((artifact) => artifact.id === 'artifact_partial_b')?.status).toBe('review_submitted');
    expect(projectState?.entries.map((entry) => entry.artifactId)).toEqual(['artifact_partial_a']);
  });

  it('derives run completion directly from the task graph without waking a coordinator', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_graph_complete',
        title: 'Graph Completion Plan',
        goal: 'Finish from the task graph alone.',
        overview: 'No coordinator should be needed after graph completion.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Task graph is the source of truth.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No extra review.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_done',
          name: 'Done Stage',
          goal: 'Already done.',
          deliverables: ['done'],
          targetFolder: 'orchestrator-output/done-stage',
          outputFiles: ['done.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_done_stage',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_done_stage',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_done',
      planStageId: 'stage_done',
      stageName: 'Done Stage',
      title: 'Done Stage',
      status: 'completed',
      reviewRequired: false,
      createdAt: now,
      updatedAt: now,
    });

    const nextRun = await wakeRunById(ctx, { runId: run.id });
    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);
    expect(nextRun?.status).toBe('completed');
    expect(coordinatorRuns).toHaveLength(0);
  });

  it('rejects stale coordinator decisions once a newer coordinator run is active', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_stale_coord',
        title: 'Stale Coordinator Plan',
        goal: 'Ignore stale orchestration decisions.',
        overview: 'Coordinator decisions should be compare-and-swap like.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Only the active coordinator may mutate the graph.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'No extra review.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_stale',
          name: 'Stale Stage',
          goal: 'Do work.',
          deliverables: ['doc'],
          targetFolder: 'orchestrator-output/stale',
          outputFiles: ['doc.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      currentStageId: 'stage_stale',
      currentStageName: 'Stale Stage',
      currentOrchestratorAgentRunId: 'coordinator_new',
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_stale_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_stale_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      stageId: 'stage_stale',
      planStageId: 'stage_stale',
      stageName: 'Stale Stage',
      title: 'Stale Stage',
      status: 'ready',
      reviewRequired: false,
      targetFolder: 'orchestrator-output/stale',
      expectedFiles: ['doc.md'],
      createdAt: now,
      updatedAt: now,
    });

    await expect(applyOrchestratorDecision(ctx, run.id, 'coordinator_old', {
      status: 'wait',
      summary: 'Old coordinator should not apply.',
      currentStageId: 'stage_stale',
      currentStageName: 'Stale Stage',
      dispatches: [],
      taskOperations: [],
    })).rejects.toThrow('stale');
  });

  it('rejects a wait decision when a legal dispatch is already available', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_wait_illegal',
        title: 'Illegal Wait Plan',
        goal: 'Do not stall when work can be dispatched.',
        overview: 'A wait decision is illegal when the next action is already known.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Known legal actions must not be ignored.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'Dispatch available work immediately.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_wait_illegal',
          name: 'Ready Stage',
          goal: 'Produce the file.',
          deliverables: ['doc'],
          targetFolder: 'orchestrator-output/ready-stage',
          outputFiles: ['doc.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      currentStageId: 'stage_wait_illegal',
      currentStageName: 'Ready Stage',
      currentOrchestratorAgentRunId: 'coordinator_wait',
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_wait_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_wait_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      assignedAgentType: 'orchestrator',
      retryPolicy: 'manual',
      stageId: 'stage_wait_illegal',
      planStageId: 'stage_wait_illegal',
      stageName: 'Ready Stage',
      title: 'Ready Stage',
      status: 'ready',
      reviewRequired: false,
      targetFolder: 'orchestrator-output/ready-stage',
      expectedFiles: ['doc.md'],
      createdAt: now,
      updatedAt: now,
    });

    await expect(applyOrchestratorDecision(ctx, run.id, 'coordinator_wait', {
      status: 'wait',
      summary: 'Wait even though work is ready.',
      currentStageId: 'stage_wait_illegal',
      currentStageName: 'Ready Stage',
      dispatches: [],
      taskOperations: [{
        type: 'wait',
        note: 'Do nothing.',
      }],
    })).rejects.toThrow('Wait is not legal');
  });

  it('skips recovery work when another persisted maintenance lease is still active', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_lease_guard',
        title: 'Lease Guard',
        goal: 'Avoid overlapping maintenance loops.',
        overview: 'Recovery should back off when another lease is active.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['Only one maintainer may recover a run at a time.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'Dispatch when ready.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_lease_guard',
          name: 'Lease Stage',
          goal: 'Produce the file.',
          deliverables: ['doc'],
          targetFolder: 'orchestrator-output/lease-stage',
          outputFiles: ['doc.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      maintenanceLease: {
        ownerId: 'other-maintainer',
        acquiredAt: now,
        heartbeatAt: now,
        expiresAt: now + 60_000,
      },
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_lease_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_lease_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      assignedAgentType: 'orchestrator',
      retryPolicy: 'manual',
      stageId: 'stage_lease_guard',
      planStageId: 'stage_lease_guard',
      stageName: 'Lease Stage',
      title: 'Lease Stage',
      status: 'ready',
      reviewRequired: false,
      targetFolder: 'orchestrator-output/lease-stage',
      expectedFiles: ['doc.md'],
      createdAt: now,
      updatedAt: now,
    });

    const recovered = await recoverOrchestratorRun(ctx, run.id);
    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);

    expect(recovered?.maintenanceLease?.ownerId).toBe('other-maintainer');
    expect(coordinatorRuns).toHaveLength(0);
    expect(vi.mocked(launchAgentSession)).not.toHaveBeenCalled();
  });

  it('allows recovery to reenter wake logic while holding the persisted maintenance lease', async () => {
    const now = Date.now();
    const run = {
      ...createRunFromPlan({
        id: 'plan_lease_reentrant_recover',
        title: 'Lease Reentrant Recovery',
        goal: 'Recover idle runs without self-blocking.',
        overview: 'Recovery should be able to wake the coordinator while still holding the lease.',
        constraints: [],
        successCriteria: [],
        decompositionPrinciples: ['The active maintainer may reenter maintenance paths for the same run.'],
        humanCheckpoints: [],
        reviewCheckpoints: [],
        reviewPolicy: 'Dispatch when ready.',
        confirmedAt: now,
        revision: 1,
        stages: [{
          id: 'stage_lease_reentrant',
          name: 'Lease Stage',
          goal: 'Produce the file.',
          deliverables: ['doc'],
          targetFolder: 'orchestrator-output/lease-reentrant',
          outputFiles: ['doc.md'],
        }],
      }, 'workbench'),
      status: 'running' as const,
      activeTaskCount: 0,
    };
    await saveRun(ctx, run);
    await saveTask(ctx, {
      id: 'task_lease_reentrant_parent',
      runId: run.id,
      nodeType: 'container',
      rootTaskId: 'task_lease_reentrant_parent',
      depth: 0,
      order: 0,
      source: 'plan_seed',
      attemptCount: 0,
      assignedAgentType: 'orchestrator',
      retryPolicy: 'manual',
      stageId: 'stage_lease_reentrant',
      planStageId: 'stage_lease_reentrant',
      stageName: 'Lease Stage',
      title: 'Lease Stage',
      status: 'ready',
      reviewRequired: false,
      targetFolder: 'orchestrator-output/lease-reentrant',
      expectedFiles: ['doc.md'],
      createdAt: now,
      updatedAt: now,
    });

    const recovered = await recoverOrchestratorRun(ctx, run.id);
    const persistedRun = await getRun(ctx, run.id);
    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);

    expect(recovered?.maintenanceLease?.ownerId).toMatch(/^lease_/);
    expect(persistedRun?.maintenanceLease).toBeUndefined();
    expect(coordinatorRuns).toHaveLength(1);
    expect(vi.mocked(launchAgentSession)).toHaveBeenCalled();
  });

  it('salvages the last valid coordinator JSON object from duplicated output', async () => {
    const now = Date.now();
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_coord_salvage',
      title: 'Coordinator Salvage Plan',
      goal: 'Continue despite duplicated coordinator JSON.',
      overview: 'The coordinator may emit malformed duplicated JSON before a valid object.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Recover the final valid decision object.'],
      humanCheckpoints: [],
      reviewCheckpoints: [],
      reviewPolicy: 'No extra review.',
      confirmedAt: now,
      revision: 1,
      stages: [{
        id: 'stage_salvage',
        name: 'Salvage Stage',
        goal: 'Dispatch one work task.',
        deliverables: ['doc'],
        targetFolder: 'orchestrator-output/salvage',
        outputFiles: ['doc.md'],
      }],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await startOrchestratorRun(ctx, run);

    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);
    expect(coordinatorRuns).toHaveLength(1);
    const coordinatorRun = coordinatorRuns[0];
    setAssistantSessionText(
      coordinatorRun.sessionId,
      `{"status":"dispatch","summary":"broken","dispatches":[{"parentTaskId":"oops","kind":"work","assignmentBrief":{"instructions":"bad {"status":"dispatch","summary":"Continue the stage.","ruleHits":["recover valid json"],"risks":[],"requiresHuman":false,"currentStageId":"stage_salvage","currentStageName":"Salvage Stage","currentAgentId":null,"currentAgentName":null,"taskOperations":[{"type":"activate_task","taskId":"task_fake"}],"dispatches":[{"parentTaskId":"task_fake","stageId":"stage_salvage","stageName":"Salvage Stage","kind":"work"}]}`,
    );

    const launchInput = vi.mocked(launchAgentSession).mock.calls[0]?.[0] as { onCompleted?: () => Promise<void> };
    expect(launchInput?.onCompleted).toBeTruthy();

    const tasksBefore = await listTasksForRun(ctx, run.id);
    const parentTask = tasksBefore.find((task) => task.nodeType === 'container' && task.stageId === 'stage_salvage');
    expect(parentTask).toBeTruthy();
    setAssistantSessionText(
      coordinatorRun.sessionId,
      `{"status":"dispatch","summary":"broken","dispatches":[{"parentTaskId":"oops","kind":"work","assignmentBrief":{"instructions":"bad {"status":"dispatch","summary":"Continue the stage.","ruleHits":["recover valid json"],"risks":[],"requiresHuman":false,"currentStageId":"stage_salvage","currentStageName":"Salvage Stage","currentAgentId":null,"currentAgentName":null,"taskOperations":[{"type":"activate_task","taskId":"${parentTask!.id}"}],"dispatches":[{"parentTaskId":"${parentTask!.id}","stageId":"stage_salvage","stageName":"Salvage Stage","kind":"work"}]}`,
    );

    await launchInput.onCompleted?.();

    const nextRun = await getRun(ctx, run.id);
    const nextCoordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);
    const agentRuns = await listAgentRunsForRun(ctx, run.id);

    expect(nextRun?.failureState).toBeUndefined();
    expect(nextCoordinatorRuns.find((item) => item.id === coordinatorRun.id)?.status).toBe('completed');
    expect(agentRuns).toHaveLength(1);
    expect(vi.mocked(launchAgentSession).mock.calls.length).toBeGreaterThan(1);
  });

  it('auto-retries coordinator runs that finish with unusable structured output', async () => {
    const now = Date.now();
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_coord_retry',
      title: 'Coordinator Retry Plan',
      goal: 'Retry unusable coordinator output automatically.',
      overview: 'Coordinator parse failures should not hang the run.',
      constraints: [],
      successCriteria: [],
      decompositionPrinciples: ['Retry coordinator formatting failures automatically.'],
      humanCheckpoints: [],
      reviewCheckpoints: [],
      reviewPolicy: 'No extra review.',
      confirmedAt: now,
      revision: 1,
      stages: [{
        id: 'stage_retry',
        name: 'Retry Stage',
        goal: 'Dispatch one work task.',
        deliverables: ['doc'],
        targetFolder: 'orchestrator-output/retry',
        outputFiles: ['doc.md'],
      }],
    };

    const run = createRunFromPlan(plan, 'workbench');
    await startOrchestratorRun(ctx, run);

    const coordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);
    const coordinatorRun = coordinatorRuns[0];
    setAssistantSessionText(coordinatorRun.sessionId, 'not valid json at all');

    const launchInput = vi.mocked(launchAgentSession).mock.calls[0]?.[0] as { onCompleted?: () => Promise<void> };
    await launchInput.onCompleted?.();

    const nextRun = await getRun(ctx, run.id);
    const nextCoordinatorRuns = await listCoordinatorRunsForRun(ctx, run.id);

    expect(nextCoordinatorRuns.find((item) => item.id === coordinatorRun.id)?.status).toBe('failed');
    expect(nextRun?.status).toBe('paused');
    expect(nextRun?.failureState?.retryable).toBe(true);
    expect(nextRun?.failureState?.requiresHuman).toBe(false);
    expect(nextRun?.failureState?.agentRunId).toBe(coordinatorRun.id);
    expect(typeof nextRun?.failureState?.autoRetryAt).toBe('number');
    expect(nextRun?.engineHealthSummary).toContain('Retrying orchestrator automatically');
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
