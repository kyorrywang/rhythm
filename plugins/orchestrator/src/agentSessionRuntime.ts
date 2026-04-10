import { Channel } from '@tauri-apps/api/core';
import { approvePermission, chatStream, createSession, interruptSession } from '../../../src/shared/api/commands';
import { persistSession } from '../../../src/shared/lib/sessionPersistence';
import { useSessionStore } from '../../../src/shared/state/useSessionStore';
import { useWorkspaceStore } from '../../../src/shared/state/useWorkspaceStore';
import type { Message, ServerEventChunk, Session, StreamRuntime } from '../../../src/shared/types/schema';
import type { OrchestratorExecutionContext } from './types';

const activeAgentStreams = new Set<string>();
const latestAgentRuntime = new Map<string, StreamRuntime>();

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
    const reasoning = executionContext.reasoning as 'low' | 'medium' | 'high' | undefined;
    const workspacePath = executionContext.workspacePath;

    store.updateSession(input.sessionId, {
      phase: 'streaming',
      workspacePath,
      error: null,
      runtime: {
        state: 'starting',
        message: '正在启动会话流。',
        updatedAt: Date.now(),
      },
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
    const hydratedSession = useSessionStore.getState().sessions.get(input.sessionId);
    if (hydratedSession) {
      persistSession(hydratedSession);
    }

    await input.onStarted?.();

    const onEvent = new Channel<ServerEventChunk>();
    onEvent.onmessage = (chunk) => {
      if (chunk.type === 'permission_request') {
        void approvePermission({ toolId: chunk.toolId, approved: true });
      }
      void input.onChunk?.(chunk);
      if (chunk.type === 'runtime_status') {
        latestAgentRuntime.set(input.sessionId, {
          state: chunk.state,
          reason: chunk.reason,
          message: chunk.message,
          attempt: chunk.attempt,
          retryAt: chunk.retryAt,
          retryInSeconds: chunk.retryInSeconds,
          updatedAt: Date.now(),
        });
      }
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
        const runtime = latestAgentRuntime.get(input.sessionId);
        if (runtime?.state === 'failed') {
          void finalizeAgentSession(input, 'failed', runtime.message || 'Agent session failed.');
        } else if (runtime?.state === 'interrupted') {
          void finalizeAgentSession(input, 'interrupted', null);
        } else {
          void finalizeAgentSession(input, 'completed', null);
        }
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
  latestAgentRuntime.delete(input.sessionId);
  const store = useSessionStore.getState();
  const runtimeState: StreamRuntime = outcome === 'failed'
    ? {
        state: 'failed',
        reason: 'error',
        message: error instanceof Error ? error.message : (error ? String(error) : 'Agent session failed.'),
        updatedAt: Date.now(),
      }
    : outcome === 'interrupted'
      ? {
          state: 'interrupted',
          reason: 'interrupt',
          message: '会话已中断。',
          updatedAt: Date.now(),
        }
      : {
          state: 'completed',
          reason: 'completed',
          message: '会话已完成。',
          updatedAt: Date.now(),
        };
  store.updateSession(input.sessionId, {
    phase: 'idle',
    error: outcome === 'failed' && error ? (error instanceof Error ? error.message : String(error)) : null,
    runtime: runtimeState,
  });
  const session = useSessionStore.getState().sessions.get(input.sessionId);
  if (session) {
    persistSession(session);
  }
  if (outcome === 'interrupted') {
    await safeInvokeCallback(() => input.onInterrupted?.(), input.sessionId, 'onInterrupted');
  } else if (outcome === 'failed') {
    await safeInvokeCallback(() => input.onFailed?.(error), input.sessionId, 'onFailed');
  } else {
    await safeInvokeCallback(() => input.onCompleted?.(), input.sessionId, 'onCompleted');
  }
}

async function safeInvokeCallback(
  callback: () => Promise<void> | void,
  sessionId: string,
  label: string,
) {
  try {
    await callback();
  } catch (callbackError) {
    console.error(`[orchestrator] ${label} callback failed for ${sessionId}`, callbackError);
    const store = useSessionStore.getState();
    const existing = store.sessions.get(sessionId);
    const callbackMessage = callbackError instanceof Error ? callbackError.message : String(callbackError);
    if (existing) {
      store.updateSession(sessionId, {
        phase: 'idle',
        error: existing.error || `[${label}] ${callbackMessage}`,
      });
      const session = useSessionStore.getState().sessions.get(sessionId);
      if (session) {
        persistSession(session);
      }
    }
    throw callbackError;
  }
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
