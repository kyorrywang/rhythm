import type { SpecAgentAssignment, SpecAgentResult } from '../domain/contracts';
import type { SpecAgentProfileId } from './agents';
import { loadSpecAgentSessions, updateSpecAgentSessions } from './storage';

export interface LaunchSpecAgentSessionInput {
  workspacePath: string;
  changeSlug: string;
  profileId: SpecAgentProfileId;
  assignment: SpecAgentAssignment;
  title: string;
}

export interface SpecAgentSessionRecord {
  id: string;
  profileId: SpecAgentProfileId;
  title: string;
  assignment: SpecAgentAssignment;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
}

export interface SpecAgentSessionResult {
  session: SpecAgentSessionRecord;
  result?: SpecAgentResult;
}

export function createSpecAgentSessionRecord(input: LaunchSpecAgentSessionInput): SpecAgentSessionRecord {
  const now = Date.now();
  return {
    id: `spec_session_${Math.random().toString(36).slice(2, 10)}`,
    profileId: input.profileId,
    title: input.title,
    assignment: input.assignment,
    status: 'queued',
    startedAt: now,
    updatedAt: now,
  };
}

export async function launchSpecAgentSession(input: LaunchSpecAgentSessionInput) {
  const queuedSession = createSpecAgentSessionRecord(input);
  const runningSession = markSpecAgentSessionRunning(queuedSession);
  await updateSpecAgentSessions(input.workspacePath, input.changeSlug, (current) => [...current, runningSession]);
  return runningSession;
}

export function markSpecAgentSessionRunning(session: SpecAgentSessionRecord) {
  return {
    ...session,
    status: 'running' as const,
    updatedAt: Date.now(),
  };
}

export function markSpecAgentSessionPaused(session: SpecAgentSessionRecord) {
  return {
    ...session,
    status: 'paused' as const,
    updatedAt: Date.now(),
  };
}

export function markSpecAgentSessionCompleted(session: SpecAgentSessionRecord, result?: SpecAgentResult): SpecAgentSessionResult {
  const completedAt = Date.now();
  return {
    session: {
      ...session,
      status: 'completed',
      completedAt,
      updatedAt: completedAt,
    },
    result,
  };
}

export function markSpecAgentSessionFailed(session: SpecAgentSessionRecord, error: string): SpecAgentSessionResult {
  const completedAt = Date.now();
  return {
    session: {
      ...session,
      status: 'failed',
      error,
      completedAt,
      updatedAt: completedAt,
    },
  };
}

export async function pauseSpecAgentSession(workspacePath: string, changeSlug: string, sessionId: string) {
  const sessions = await updateSpecAgentSessions(workspacePath, changeSlug, (current) => current.map((session) => session.id === sessionId
    ? markSpecAgentSessionPaused(session)
    : session));
  return sessions.find((session) => session.id === sessionId) || null;
}

export async function completeSpecAgentSession(
  workspacePath: string,
  changeSlug: string,
  sessionId: string,
  result?: SpecAgentResult,
) {
  let completed: SpecAgentSessionResult | null = null;
  await updateSpecAgentSessions(workspacePath, changeSlug, (current) => current.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }
    completed = markSpecAgentSessionCompleted(session, result);
    return completed.session;
  }));
  return completed;
}

export async function failSpecAgentSession(
  workspacePath: string,
  changeSlug: string,
  sessionId: string,
  error: string,
) {
  let failed: SpecAgentSessionResult | null = null;
  await updateSpecAgentSessions(workspacePath, changeSlug, (current) => current.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }
    failed = markSpecAgentSessionFailed(session, error);
    return failed.session;
  }));
  return failed;
}

export async function listSpecAgentSessions(workspacePath: string, changeSlug: string) {
  return loadSpecAgentSessions(workspacePath, changeSlug);
}
