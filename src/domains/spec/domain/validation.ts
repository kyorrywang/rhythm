import type {
  SpecExecutorResult,
  SpecOrchestratorDecision,
  SpecPlannerResult,
  SpecReviewerResult,
} from './contracts';
import type { SpecRuntimeSnapshot, SpecTask } from './types';
import { computeLegalOrchestrationActions } from './stateMachine';

function assertNonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be a string array.`);
  }
}

export function assertValidSpecPlannerResult(result: SpecPlannerResult) {
  if (result.kind !== 'spec_planner_result') {
    throw new Error('Planner result kind mismatch.');
  }
  assertNonEmptyString(result.summary, 'planner.summary');
  assertNonEmptyString(result.plan.summary, 'planner.plan.summary');
  assertNonEmptyString(result.plan.approach, 'planner.plan.approach');
  for (const [index, stage] of result.plan.stages.entries()) {
    assertNonEmptyString(stage.id, `planner.plan.stages[${index}].id`);
    assertNonEmptyString(stage.name, `planner.plan.stages[${index}].name`);
    assertStringArray(stage.deliverables, `planner.plan.stages[${index}].deliverables`);
    assertStringArray(stage.outputFiles, `planner.plan.stages[${index}].outputFiles`);
  }
  for (const [index, task] of result.taskBlueprints.entries()) {
    assertNonEmptyString(task.title, `planner.taskBlueprints[${index}].title`);
    assertStringArray(task.dependsOn, `planner.taskBlueprints[${index}].dependsOn`);
    assertStringArray(task.acceptanceCriteria, `planner.taskBlueprints[${index}].acceptanceCriteria`);
    assertStringArray(task.targetPaths, `planner.taskBlueprints[${index}].targetPaths`);
  }
}

export function assertValidSpecExecutorResult(result: SpecExecutorResult, task: SpecTask) {
  if (result.kind !== 'spec_executor_result') {
    throw new Error('Executor result kind mismatch.');
  }
  assertNonEmptyString(result.summary, 'executor.summary');
  if (result.artifactDrafts.length === 0 && task.failurePolicy !== 'skip') {
    throw new Error('Executor result must contain at least one artifact draft unless the task is explicitly skippable.');
  }
  for (const [index, artifact] of result.artifactDrafts.entries()) {
    assertNonEmptyString(artifact.logicalKey, `executor.artifactDrafts[${index}].logicalKey`);
    assertNonEmptyString(artifact.name, `executor.artifactDrafts[${index}].name`);
    assertStringArray(artifact.filePaths, `executor.artifactDrafts[${index}].filePaths`);
  }
}

export function assertValidSpecReviewerResult(result: SpecReviewerResult) {
  if (result.kind !== 'spec_reviewer_result') {
    throw new Error('Reviewer result kind mismatch.');
  }
  assertNonEmptyString(result.summary, 'reviewer.summary');
  if (!['accepted', 'changes_requested', 'blocked', 'human_required'].includes(result.decision)) {
    throw new Error(`Unsupported review decision: ${result.decision}`);
  }
  for (const [index, finding] of result.findings.entries()) {
    assertNonEmptyString(finding.summary, `reviewer.findings[${index}].summary`);
    assertNonEmptyString(finding.detail, `reviewer.findings[${index}].detail`);
    assertStringArray(finding.targetPaths, `reviewer.findings[${index}].targetPaths`);
  }
}

export function assertValidSpecOrchestratorDecision(decision: SpecOrchestratorDecision, snapshot: SpecRuntimeSnapshot) {
  if (decision.kind !== 'spec_orchestration_decision') {
    throw new Error('Orchestrator decision kind mismatch.');
  }
  assertNonEmptyString(decision.summary, 'orchestrator.summary');
  assertStringArray(decision.rationale, 'orchestrator.rationale');
  const legalActions = computeLegalOrchestrationActions(snapshot);
  const serializedLegalActions = new Set(legalActions.map((action) => JSON.stringify(action)));
  const requestedAction = JSON.stringify(decision.action);
  if (!serializedLegalActions.has(requestedAction)) {
    throw new Error(`Illegal orchestrator action for current snapshot: ${requestedAction}`);
  }
}
