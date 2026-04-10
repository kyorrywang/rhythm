import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '@/plugin/sdk';
import { startOrchestratorRun } from '../../plugins/orchestrator/src/runtime';
import { getRun, listAgentRunsForRun, listTasksForRun } from '../../plugins/orchestrator/src/storage';
import { createRunFromPlan } from '../../plugins/orchestrator/src/utils';
import type { OrchestratorConfirmedPlan } from '../../plugins/orchestrator/src/types';

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

describe('orchestrator runtime', () => {
  let files = new Map<string, string>();
  let ctx: PluginContext;

  beforeEach(() => {
    files = new Map();
    ctx = createMockContext(files);
  });

  it('seeds all plan stages and dispatches the first work agent instead of completing immediately', async () => {
    const plan: OrchestratorConfirmedPlan = {
      id: 'plan_test_novel',
      title: 'Novel Outline Test',
      goal: 'Write a reviewed novel outline draft.',
      overview: 'Phase one end-to-end test.',
      constraints: ['Do not skip review.'],
      successCriteria: ['Produce a complete outline draft.'],
      reviewPolicy: 'Review every stage.',
      confirmedAt: Date.now(),
      stages: [
        {
          id: 'stage_1',
          name: 'Premise And Direction',
          goal: 'Define the premise.',
          deliverables: ['premise'],
        },
        {
          id: 'stage_2',
          name: 'Worldbuilding',
          goal: 'Build the setting.',
          deliverables: ['world'],
        },
      ],
    };

    const run = createRunFromPlan(plan, 'workbench');
    const started = await startOrchestratorRun(ctx, run);

    expect(started.status).toBe('running');
    expect(started.activeTaskCount).toBe(1);
    expect(started.currentStageName).toBe('Premise And Direction');
    expect(started.lastDecisionSummary).toContain('Dispatch');

    const persistedRun = await getRun(ctx, run.id);
    expect(persistedRun?.status).toBe('running');

    const tasks = await listTasksForRun(ctx, run.id);
    expect(tasks.filter((task) => task.nodeType === 'container')).toHaveLength(2);
    expect(tasks.some((task) => task.kind === 'work' && task.stageId === 'stage_1')).toBe(true);

    const agentRuns = await listAgentRunsForRun(ctx, run.id);
    expect(agentRuns).toHaveLength(1);
    expect(agentRuns[0]?.kind).toBe('work');
    expect(agentRuns[0]?.stageId).toBe('stage_1');
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
