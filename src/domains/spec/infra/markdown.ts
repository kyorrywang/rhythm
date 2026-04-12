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

export const SPEC_MARKDOWN_CONTRACTS = SPEC_FILE_CONTRACT.markdown;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(markdown: string, title: string) {
  const pattern = new RegExp(`## ${escapeRegExp(title)}\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`, 'i');
  const match = markdown.match(pattern);
  return match?.[1]?.trim() || '';
}

function parseListBlock(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, '').trim())
    .filter((line) => line.length > 0 && line.toLowerCase() !== 'none');
}

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
    `- Run status: ${state.runs[state.runs.length - 1]?.status || 'not_started'}`,
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

export function parseSpecChangeMarkdown(markdown: string) {
  return {
    goal: extractSection(markdown, 'Goal'),
    overview: extractSection(markdown, 'Overview'),
    scope: parseListBlock(extractSection(markdown, 'Scope')),
    nonGoals: parseListBlock(extractSection(markdown, 'Non-Goals')),
    constraints: parseListBlock(extractSection(markdown, 'Constraints')),
    risks: parseListBlock(extractSection(markdown, 'Risks')),
    successCriteria: parseListBlock(extractSection(markdown, 'Success Criteria')),
  };
}

export function parseSpecPlanMarkdown(markdown: string) {
  const stagesBlock = extractSection(markdown, 'Stages');
  const stages = stagesBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ['))
    .map((line, index) => ({
      id: `stage_${index + 1}`,
      name: line.replace(/^- \[[ x]\]\s*/, '').replace(/^Stage \d+:\s*/, '').trim(),
    }))
    .filter((stage) => stage.name.length > 0);

  return {
    summary: extractSection(markdown, 'Summary'),
    approach: extractSection(markdown, 'Approach'),
    checkpoints: parseListBlock(extractSection(markdown, 'Checkpoints')),
    reviewStrategy: parseListBlock(extractSection(markdown, 'Review Strategy')),
    openQuestions: parseListBlock(extractSection(markdown, 'Open Questions')),
    stages,
  };
}

export function parseSpecTasksMarkdown(markdown: string) {
  const checklist = extractSection(markdown, 'Checklist')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ['))
    .map((line) => {
      const match = line.match(/^- \[([ x])\]\s*(.+)$/i);
      return match
        ? {
            completed: match[1].toLowerCase() === 'x',
            title: match[2].trim(),
          }
        : null;
    })
    .filter((item): item is { completed: boolean; title: string } => Boolean(item?.title));

  return {
    checklist,
    current: extractSection(markdown, 'Current'),
    blocked: parseListBlock(extractSection(markdown, 'Blocked')),
    reviewFindings: parseListBlock(extractSection(markdown, 'Review Findings')),
    recentUpdates: parseListBlock(extractSection(markdown, 'Recent Updates')),
  };
}
