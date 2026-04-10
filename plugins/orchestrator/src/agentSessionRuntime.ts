import { Channel } from '@tauri-apps/api/core';
import { approvePermission, chatStream, createSession, interruptSession } from '../../../src/shared/api/commands';
import { persistSession } from '../../../src/shared/lib/sessionPersistence';
import { useSessionStore } from '../../../src/shared/state/useSessionStore';
import { useWorkspaceStore } from '../../../src/shared/state/useWorkspaceStore';
import type { Message, ServerEventChunk, Session } from '../../../src/shared/types/schema';
import type { OrchestratorExecutionContext } from './types';

const activeAgentStreams = new Set<string>();

export interface LaunchAgentSessionInput {
  sessionId: string;
  title: string;
  prompt: string;
  parentSessionId?: string;
  executionContext?: OrchestratorExecutionContext;
  allowedTools?: string[];
  disallowedTools?: string[];
  onStarted?: () => Promise<void> | void;
  onChunk?: (chunk: ServerEventChunk) => Promise<void> | void;
  onCompleted?: () => Promise<void> | void;
  onFailed?: (error: unknown) => Promise<void> | void;
  onInterrupted?: () => Promise<void> | void;
}

export async function ensureAgentSession(
  sessionId: string,
  title: string,
  parentSessionId?: string,
  executionContext?: OrchestratorExecutionContext,
) {
  const existing = useSessionStore.getState().sessions.get(sessionId);
  if (existing) return existing;

  const workspacePath = executionContext?.workspacePath || getActiveWorkspacePath();
  const session = await createSession(title, workspacePath);
  const nextSession: Session = {
    ...session,
    id: sessionId,
    title,
    workspacePath,
    messages: [],
    parentId: parentSessionId,
    phase: 'idle',
  };
  useSessionStore.getState().addSession(nextSession);
  persistSession(nextSession);
  return nextSession;
}

export async function launchAgentSession(input: LaunchAgentSessionInput) {
  if (activeAgentStreams.has(input.sessionId)) {
    return;
  }
  activeAgentStreams.add(input.sessionId);

  try {
    await ensureAgentSession(input.sessionId, input.title, input.parentSessionId, input.executionContext);
    const store = useSessionStore.getState();
    const executionContext = resolveExecutionContext(input.executionContext);
    const providerId = executionContext.providerId;
    const model = executionContext.model;
    const reasoning = executionContext.reasoning;
    const workspacePath = executionContext.workspacePath;

    store.updateSession(input.sessionId, {
      phase: 'streaming',
      workspacePath,
      error: null,
    });

    const userMsg: Message = {
      id: `${input.sessionId}-u-${Date.now()}`,
      role: 'user',
      content: input.prompt,
      createdAt: Date.now(),
    };
    store.addMessage(input.sessionId, userMsg);

    const aiMessageId = `${input.sessionId}-a-${Date.now()}`;
    store.addMessage(input.sessionId, {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      model,
      createdAt: Date.now(),
      segments: [],
    });

    await input.onStarted?.();

    const onEvent = new Channel<ServerEventChunk>();
    onEvent.onmessage = (chunk) => {
      if (chunk.type === 'permission_request') {
        void approvePermission({ toolId: chunk.toolId, approved: true });
      }
      void input.onChunk?.(chunk);
      const liveState = useSessionStore.getState();
      const reduced = liveState.processChunk(liveState.sessions, input.sessionId, aiMessageId, chunk);
      useSessionStore.setState((state) => ({
        ...state,
        sessions: reduced.sessions,
        activeSessionId: reduced.activeSessionId ?? state.activeSessionId,
      }));
      const session = reduced.sessions.get(input.sessionId);
      if (session) {
        persistSession(session);
      }

      if (chunk.type === 'done') {
        void finalizeAgentSession(input, 'completed', null);
      } else if (chunk.type === 'interrupted') {
        void finalizeAgentSession(input, 'interrupted', null);
      }
    };

    await chatStream({
      sessionId: input.sessionId,
      prompt: input.prompt,
      attachments: [],
      permissionMode: 'full_auto',
      allowedTools: input.allowedTools,
      disallowedTools: input.disallowedTools,
      providerId,
      model,
      reasoning,
      mode: 'chat',
      cwd: workspacePath,
    }, onEvent);
  } catch (error) {
    await finalizeAgentSession(input, 'failed', error);
  }
}

export function isAgentSessionActive(sessionId: string) {
  return activeAgentStreams.has(sessionId);
}

export async function interruptAgentSession(sessionId: string) {
  await interruptSession({ sessionId });
}

async function finalizeAgentSession(
  input: LaunchAgentSessionInput,
  outcome: 'completed' | 'failed' | 'interrupted',
  error: unknown,
) {
  if (!activeAgentStreams.delete(input.sessionId)) {
    return;
  }
  const store = useSessionStore.getState();
  store.updateSession(input.sessionId, {
    phase: 'idle',
    error: outcome === 'failed' && error ? (error instanceof Error ? error.message : String(error)) : null,
  });
  const session = useSessionStore.getState().sessions.get(input.sessionId);
  if (session) {
    persistSession(session);
  }

  const completionLooksBroken = outcome === 'completed' && sessionHasErrorOutput(session);
  if (completionLooksBroken) {
    const derivedError = extractSessionError(session) || 'Agent session completed with an error output.';
    store.updateSession(input.sessionId, {
      phase: 'idle',
      error: derivedError,
    });
    const erroredSession = useSessionStore.getState().sessions.get(input.sessionId);
    if (erroredSession) {
      persistSession(erroredSession);
    }
    await input.onFailed?.(derivedError);
    return;
  }

  if (outcome === 'interrupted') {
    await input.onInterrupted?.();
  } else if (outcome === 'failed') {
    await input.onFailed?.(error);
  } else {
    await input.onCompleted?.();
  }
}

function sessionHasErrorOutput(session?: Session) {
  if (!session) return false;
  return session.messages.some((message) =>
    message.role === 'assistant'
    && containsAgentError(message.content || ''),
  );
}

function extractSessionError(session?: Session) {
  if (!session) return null;
  const assistantMessages = session.messages.filter((message) => message.role === 'assistant');
  for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
    const content = assistantMessages[index]?.content || '';
    if (containsAgentError(content)) {
      return content.trim();
    }
  }
  return null;
}

function containsAgentError(content: string) {
  const normalized = content.toLowerCase();
  return normalized.includes('[error:')
    || normalized.includes('llm error:')
    || normalized.includes('error sending request')
    || normalized.includes('api.minimaxi.com');
}

function getActiveWorkspacePath() {
  const state = useWorkspaceStore.getState();
  return (
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.path ||
    state.workspaces[0]?.path ||
    ''
  );
}

function resolveExecutionContext(executionContext?: OrchestratorExecutionContext) {
  const store = useSessionStore.getState();
  return {
    providerId: executionContext?.providerId || store.composerControls.providerId,
    model: executionContext?.model || store.composerControls.modelName,
    reasoning: executionContext?.reasoning || store.composerControls.reasoning,
    workspacePath: executionContext?.workspacePath || getActiveWorkspacePath(),
    capturedAt: executionContext?.capturedAt || Date.now(),
  } satisfies OrchestratorExecutionContext;
}
