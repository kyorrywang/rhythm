import { SPEC_AGENT_PROFILE_IDS } from '../infra/agents';
import { SPEC_FILE_CONTRACT, SPEC_MARKDOWN_CONTRACTS } from '../infra/markdown';
import { SPEC_TERMS } from '../domain/naming';
import type { SpecIntegrationAction } from './actions';

export interface SpecModeDefinition {
  id: 'spec';
  label: string;
  description: string;
  ownership: 'core';
  primaryObject: 'change';
  supportsUi: false;
  commandsNamespace: 'spec';
  actionTypes: SpecIntegrationAction['type'][];
  agentProfiles: string[];
  contracts: {
    files: typeof SPEC_FILE_CONTRACT;
    markdown: typeof SPEC_MARKDOWN_CONTRACTS;
  };
  terms: typeof SPEC_TERMS;
}

export const SPEC_MODE_DEFINITION: SpecModeDefinition = {
  id: 'spec',
  label: 'Spec',
  description: 'Planning-led change execution built around durable spec artifacts and task orchestration.',
  ownership: 'core',
  primaryObject: 'change',
  supportsUi: false,
  commandsNamespace: 'spec',
  actionTypes: [
    'spec.create_change',
    'spec.list_changes',
    'spec.load_change',
    'spec.snapshot',
    'spec.timeline',
    'spec.sync_from_disk',
    'spec.build_orchestrator_assignment',
    'spec.build_planner_assignment',
    'spec.build_executor_assignment',
    'spec.build_reviewer_assignment',
    'spec.launch_agent_session',
    'spec.list_agent_sessions',
    'spec.complete_agent_session',
    'spec.fail_agent_session',
    'spec.start_run',
    'spec.compute_next_actions',
    'spec.apply_planner_result',
    'spec.apply_orchestrator_decision',
    'spec.apply_executor_result',
    'spec.apply_reviewer_result',
    'spec.retry_task',
    'spec.fail_task',
    'spec.approve_human_task',
    'spec.pause_run',
    'spec.resume_run',
    'spec.recover_run',
    'spec.watchdog_run',
  ],
  agentProfiles: [
    SPEC_AGENT_PROFILE_IDS.orchestrator,
    SPEC_AGENT_PROFILE_IDS.planner,
    SPEC_AGENT_PROFILE_IDS.executor,
    SPEC_AGENT_PROFILE_IDS.reviewer,
  ],
  contracts: {
    files: SPEC_FILE_CONTRACT,
    markdown: SPEC_MARKDOWN_CONTRACTS,
  },
  terms: SPEC_TERMS,
};
