import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPEC_AGENT_PROFILE_IDS } from '@/domains/spec/agents';
import { getSpecChangePaths, makeSpecChangeSlug } from '@/domains/spec/changeFs';
import { buildInitialSpecState, createSpecChangeScaffold } from '@/domains/spec/stateSync';

describe('spec foundation', () => {
  it('creates stable change slugs and change paths', () => {
    const slug = makeSpecChangeSlug('Add Login Rate Limit!');
    const paths = getSpecChangePaths('C:/workspace/demo', slug);

    expect(slug).toBe('add-login-rate-limit');
    expect(paths.changeDir).toContain('.spec');
    expect(paths.changeFile.endsWith('change.md')).toBe(true);
    expect(paths.stateFile.endsWith('state.json')).toBe(true);
  });

  it('builds an initial spec state snapshot', () => {
    const state = buildInitialSpecState({
      title: 'Refactor Plugin Loading',
      goal: 'Move plugin loading to the core runtime boundary.',
      constraints: ['Do not break existing workspaces.'],
    });

    expect(state.mode).toBe('spec');
    expect(state.status).toBe('draft');
    expect(state.execution.activeAgentProfileId).toBe(SPEC_AGENT_PROFILE_IDS.planner);
    expect(state.tasks.total).toBe(0);
  });

  it('writes the initial spec scaffold to disk', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rhythm-spec-'));

    const { state, paths } = await createSpecChangeScaffold(workspacePath, {
      title: 'Fix Session Recovery',
      goal: 'Create the first spec scaffold for a recovery fix.',
      overview: 'This initializes the markdown and state files for a change.',
      successCriteria: ['Files exist on disk.'],
    });

    const changeMd = await fs.readFile(paths.changeFile, 'utf8');
    const planMd = await fs.readFile(paths.planFile, 'utf8');
    const tasksMd = await fs.readFile(paths.tasksFile, 'utf8');
    const stateJson = JSON.parse(await fs.readFile(paths.stateFile, 'utf8')) as { slug: string; status: string };

    expect(changeMd).toContain('# Fix Session Recovery');
    expect(planMd).toContain('# Plan: Fix Session Recovery');
    expect(tasksMd).toContain('# Tasks: Fix Session Recovery');
    expect(stateJson.slug).toBe(state.slug);
    expect(stateJson.status).toBe('draft');
  });
});
