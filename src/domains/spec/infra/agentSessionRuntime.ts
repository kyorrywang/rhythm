import type { SpecAgentAssignment, SpecAgentResult } from '../domain/contracts';
import type { SpecAgentProfileId } from './agents';

export interface LaunchSpecAgentSessionInput {
  profileId: SpecAgentProfileId;
  assignment: SpecAgentAssignment;
  title: string;
}

export interface SpecAgentSessionRecord {
  id: string;
  profileId: SpecAgentProfileId;
  title: string;
  assignment: SpecAgentAssignment;
  startedAt: number;
}

export interface SpecAgentSessionResult {
  session: SpecAgentSessionRecord;
  result?: SpecAgentResult;
}

export function createSpecAgentSessionRecord(input: LaunchSpecAgentSessionInput): SpecAgentSessionRecord {
  return {
    id: `spec_session_${Math.random().toString(36).slice(2, 10)}`,
    profileId: input.profileId,
    title: input.title,
    assignment: input.assignment,
    startedAt: Date.now(),
  };
}
