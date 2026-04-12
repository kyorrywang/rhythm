export const SPEC_TERMS = {
  mode: 'spec',
  primaryObject: 'change',
  planObject: 'plan',
  taskObject: 'task',
  artifactObject: 'artifact',
  reviewObject: 'review',
  runObject: 'run',
} as const;

export const LEGACY_ORCHESTRATOR_NAME_MAP = {
  orchestrator: 'spec',
  planDraft: 'changeDraft',
  coordinator: 'spec-orchestrator',
  workAgent: 'spec-executor',
  reviewAgent: 'spec-reviewer',
} as const;

export interface SpecBoundaryDefinition {
  ownedBySpec: string[];
  explicitlyOutOfScope: string[];
}

export const SPEC_BOUNDARY: SpecBoundaryDefinition = {
  ownedBySpec: [
    'change lifecycle',
    'plan generation',
    'task graph state',
    'artifact lineage',
    'review and rework',
    'run recovery',
    'maintenance lease',
    'markdown contract',
  ],
  explicitlyOutOfScope: [
    'UI rendering',
    'plugin activity bar registration',
    'session conversation chrome',
  ],
};
