import type { SpecChangeScaffoldInput, SpecFileContract, SpecMarkdownContract } from '../domain/contracts';
import type { SpecState } from '../domain/types';

function renderList(items: string[], empty = '- None') {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : empty;
}

export const SPEC_CHANGE_MARKDOWN_CONTRACT: SpecMarkdownContract = {
  managedSections: [
    { key: 'status', title: 'Status', owner: 'system' },
    { key: 'goal', title: 'Goal', owner: 'shared' },
    { key: 'overview', title: 'Overview', owner: 'shared' },
    { key: 'scope', title: 'Scope', owner: 'shared' },
    { key: 'non_goals', title: 'Non-Goals', owner: 'shared' },
    { key: 'constraints', title: 'Constraints', owner: 'shared' },
    { key: 'risks', title: 'Risks', owner: 'shared' },
    { key: 'success_criteria', title: 'Success Criteria', owner: 'shared' },
  ],
};

export const SPEC_PLAN_MARKDOWN_CONTRACT: SpecMarkdownContract = {
  managedSections: [
    { key: 'overview', title: 'Summary', owner: 'shared' },
    { key: 'current', title: 'Approach', owner: 'shared' },
    { key: 'recent_updates', title: 'Stages', owner: 'system' },
  ],
};

export const SPEC_TASKS_MARKDOWN_CONTRACT: SpecMarkdownContract = {
  managedSections: [
    { key: 'status', title: 'Status', owner: 'system' },
    { key: 'current', title: 'Current', owner: 'system' },
    { key: 'blocked', title: 'Blocked', owner: 'system' },
    { key: 'recent_updates', title: 'Recent Updates', owner: 'system' },
  ],
};

export const SPEC_FILE_CONTRACT: SpecFileContract = {
  stateSchemaVersion: 1,
  markdown: {
    change: SPEC_CHANGE_MARKDOWN_CONTRACT,
    plan: SPEC_PLAN_MARKDOWN_CONTRACT,
    tasks: SPEC_TASKS_MARKDOWN_CONTRACT,
  },
};

export function renderSpecChangeMarkdown(input: SpecChangeScaffoldInput) {
  return `# ${input.title}

## Status

- Draft

## Goal

${input.goal}

## Overview

${input.overview || 'TBD'}

## Scope

${renderList(input.scope || [])}

## Non-Goals

${renderList(input.nonGoals || [])}

## Constraints

${renderList(input.constraints || [])}

## Risks

${renderList(input.risks || [])}

## Success Criteria

${renderList(input.successCriteria || [])}
`;
}

export function renderSpecPlanMarkdown(state: SpecState) {
  const stages = state.plan.stages.length > 0
    ? state.plan.stages.map((stage, index) => `- [ ] Stage ${index + 1}: ${stage.name}\n  Goal: ${stage.goal}`).join('\n')
    : '- [ ] Stage 1: Plan the change';
  return `# Plan: ${state.change.title}

## Summary

${state.plan.summary || state.change.overview || state.change.goal}

## Approach

${state.plan.approach || 'TBD'}

## Stages

${stages}

## Checkpoints

${renderList(state.plan.checkpoints)}

## Review Strategy

${renderList(state.plan.reviewStrategy)}

## Open Questions

${renderList(state.plan.openQuestions)}
`;
}

export function renderSpecTasksMarkdown(state: SpecState) {
  const checklist = state.tasks.length > 0
    ? state.tasks.map((task) => `- [${task.status === 'completed' ? 'x' : ' '}] ${task.title}`).join('\n')
    : '- [ ] Generate the first execution plan';
  const currentTask = state.metrics.tasks.currentTaskTitle || 'No task is running yet.';
  const recentUpdates = [
    `- Change status: ${state.change.status}`,
    `- Run status: ${state.runs.at(-1)?.status || 'not_started'}`,
  ].join('\n');

  return `# Tasks: ${state.change.title}

## Checklist

${checklist}

## Current

${currentTask}

## Blocked

${renderList(
    state.tasks
      .filter((task) => task.status === 'blocked' && task.blockedReason)
      .map((task) => `${task.title}: ${task.blockedReason}`),
  )}

## Review Findings

${renderList(
    state.reviews
      .flatMap((review) => review.findings.map((finding) => `${finding.severity.toUpperCase()}: ${finding.summary}`)),
  )}

## Recent Updates

${recentUpdates}
`;
}
