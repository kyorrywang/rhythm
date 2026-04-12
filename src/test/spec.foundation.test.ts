import { describe, expect, it } from 'vitest';
import { SPEC_AGENT_PROFILE_ID } from '@/domains/spec/infra/agents';
import { getSpecRelativePaths, makeSpecChangeSlug } from '@/domains/spec/infra/changeFs';
import { createSpecDraftState } from '@/domains/spec/application/editor';

describe('spec foundation', () => {
  it('creates stable change slugs and change paths', () => {
    const slug = makeSpecChangeSlug('Add Login Rate Limit!');
    const paths = getSpecRelativePaths(slug);

    expect(slug).toBe('add-login-rate-limit');
    expect(paths.changeDir).toContain('.spec');
    expect(paths.proposal.endsWith('proposal.md')).toBe(true);
    expect(paths.state.endsWith('state.json')).toBe(true);
  });

  it('builds an initial spec state snapshot', () => {
    const state = createSpecDraftState({
      title: 'Refactor Plugin Loading',
      goal: 'Move plugin loading to the core runtime boundary.',
    });

    expect(state.mode).toBe('spec');
    expect(state.status).toBe('draft');
    expect(state.progress.total).toBe(0);
    expect(state.progress.done).toBe(0);
  });

  it('has correct agent profile ID', () => {
    expect(SPEC_AGENT_PROFILE_ID).toBe('spec-agent');
  });
});
