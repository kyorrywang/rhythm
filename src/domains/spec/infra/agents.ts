import type { SpecAgentProfileContract } from '../domain/contracts';

export const SPEC_MODE_ID = 'spec';

export type SpecAgentRole = 'orchestrator' | 'planner' | 'executor' | 'reviewer';

export const SPEC_AGENT_PROFILE_IDS = {
  orchestrator: 'spec-orchestrator',
  planner: 'spec-planner',
  executor: 'spec-executor',
  reviewer: 'spec-reviewer',
} as const;

export type SpecAgentProfileId = typeof SPEC_AGENT_PROFILE_IDS[keyof typeof SPEC_AGENT_PROFILE_IDS];

export const SPEC_AGENT_PROFILES: Record<SpecAgentProfileId, SpecAgentProfileContract> = {
  'spec-orchestrator': {
    id: 'spec-orchestrator',
    role: 'orchestrator',
    permissionMode: 'full_auto',
    allowedTools: [],
    disallowedTools: ['shell', 'write', 'edit', 'spawn_subagent', 'task_dock'],
    maxTurns: 8,
    prompt: {
      identity: 'You are the spec orchestrator.',
      job: 'Read the persisted spec state and choose exactly one legal next action.',
      forbidden: [
        'Do not write deliverables.',
        'Do not edit files.',
        'Do not call execution tools.',
        'Do not spawn subagents.',
        'Do not bypass the task graph.',
      ],
      outputRequirement: 'Return exactly one orchestration decision object.',
      example: '{"kind":"spec_orchestration_decision","summary":"Dispatch the first ready task.","rationale":["The plan exists.","No task is active."],"action":{"type":"dispatch_task","taskId":"task_impl_api","profileId":"spec-executor"}}',
    },
  },
  'spec-planner': {
    id: 'spec-planner',
    role: 'planner',
    permissionMode: 'full_auto',
    allowedTools: ['read', 'write', 'edit'],
    disallowedTools: ['spawn_subagent', 'task_dock'],
    maxTurns: 16,
    prompt: {
      identity: 'You are the spec planner.',
      job: 'Turn a change request into a clear plan and an executable task graph.',
      forbidden: [
        'Do not claim implementation is complete.',
        'Do not bypass review and execution phases.',
      ],
      outputRequirement: 'Return one planner result object with plan and task blueprints.',
      example: '{"kind":"spec_planner_result","summary":"The change is split into three stages.","plan":{"summary":"Plan summary","approach":"Chosen approach","stages":[{"id":"stage_1","name":"Design","goal":"Define the design","deliverables":["design"],"targetFolder":".spec/changes/example/artifacts/design","outputFiles":["design.md"],"requiresReview":true,"humanCheckpointRequired":false}],"checkpoints":["Confirm scope"],"reviewStrategy":["Review each implementation task"],"openQuestions":[]},"taskBlueprints":[{"id":"task_design","title":"Write design draft","kind":"plan","stageId":"stage_1","dependsOn":[],"acceptanceCriteria":["Design document exists"],"targetPaths":[".spec/changes/example/plan.md"],"reviewRequired":true,"summary":"Produce the initial design draft."}]}',
    },
  },
  'spec-executor': {
    id: 'spec-executor',
    role: 'executor',
    permissionMode: 'full_auto',
    allowedTools: ['read', 'write', 'edit', 'shell'],
    disallowedTools: ['spawn_subagent', 'task_dock'],
    maxTurns: 24,
    prompt: {
      identity: 'You are the spec executor.',
      job: 'Complete the assigned task and produce the requested artifacts.',
      forbidden: [
        'Do not mutate the task graph.',
        'Do not self-approve completion.',
      ],
      outputRequirement: 'Return one executor result object with concise artifact summaries.',
      example: '{"kind":"spec_executor_result","summary":"The task output is ready for review.","artifactDrafts":[{"logicalKey":"task_impl_api","name":"API implementation summary","filePaths":["src/api.ts"],"summary":"Added the new endpoint and validation."}]}',
    },
  },
  'spec-reviewer': {
    id: 'spec-reviewer',
    role: 'reviewer',
    permissionMode: 'full_auto',
    allowedTools: ['read'],
    disallowedTools: ['write', 'edit', 'shell', 'spawn_subagent', 'task_dock'],
    maxTurns: 12,
    prompt: {
      identity: 'You are the spec reviewer.',
      job: 'Review the assigned task result and return a structured decision.',
      forbidden: [
        'Do not edit implementation files.',
        'Do not convert review into execution.',
      ],
      outputRequirement: 'Return one reviewer result object only.',
      example: '{"kind":"spec_reviewer_result","summary":"The task is acceptable.","decision":"accepted","findings":[],"requiresRework":false}',
    },
  },
};

export function getSpecAgentProfile(profileId: SpecAgentProfileId) {
  return SPEC_AGENT_PROFILES[profileId];
}
