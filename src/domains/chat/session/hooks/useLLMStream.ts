import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Channel } from '@tauri-apps/api/core';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import { usePermissionStore } from '@/core/permissions/usePermissionStore';
import { useSettingsStore } from '@/core/runtime/useSettingsStore';
import { useToastStore } from '@/ui/state/useToastStore';
import { useWorkspaceStore } from '@/core/workspace/useWorkspaceStore';
import { persistSession, persistSessions } from '@/core/sessions/sessionPersistence';
import { hasSessionPermissionGrant } from '@/core/permissions/sessionPermissions';
import { Attachment, Message, ServerEventChunk, Session } from '@/shared/types/schema';
import { attachSessionStream, chatStream, submitUserAnswer, approvePermission, interruptSession, llmComplete, listRuntimeSessions } from '@/core/runtime/api/commands';
import { getMessageTextContent, isSessionRunning } from '@/core/sessions/sessionState';
import { applySpecToolResult } from '@/domains/spec/integration/chatFlow';
import type { BackendAgent, BackendSettings } from '@/shared/types/api';

const TITLE_SYSTEM_PROMPT = [
  'You generate concise chat titles.',
  'Return only one short title, without quotes, punctuation wrappers, markdown, or explanation.',
  "Use the same language as the user's message when possible.",
  'Keep it within 4 to 12 Chinese characters, or 2 to 6 English words.',
].join('\n');

export const useLLMStream = () => {
  const store = useSessionStore;
  const permissionStore = usePermissionStore;
  const sessions = useSessionStore((s) => s.sessions);

  const abortRef = useRef(false);
  const interruptedSessionIdsRef = useRef<Set<string>>(new Set());
  const subSessionMessageMapRef = useRef<Map<string, string>>(new Map());
  const persistTimersRef = useRef<Map<string, number>>(new Map());
  const attachedSessionIdsRef = useRef<Set<string>>(new Set());
  const processQueueAfterDoneRef = useRef<((sessionId: string) => void) | null>(null);
  const lastEventIdByRootSessionRef = useRef<Map<string, number>>(new Map());
  const lastActivityAtBySessionRef = useRef<Map<string, number>>(new Map());

  const isStreaming = useMemo(
    () => Array.from(sessions.values()).some((session) => !session.parentId && isSessionRunning(session)),
    [sessions],
  );

  const schedulePersistSession = useCallback((sessionId: string | undefined, immediate = false) => {
    if (!sessionId) return;
    const existingTimer = persistTimersRef.current.get(sessionId);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      persistTimersRef.current.delete(sessionId);
    }

    if (immediate) {
      const latestSession = store.getState().sessions.get(sessionId);
      if (latestSession) {
        persistSession(latestSession);
      }
      return;
    }

    const timer = window.setTimeout(() => {
      const latestSession = store.getState().sessions.get(sessionId);
      if (latestSession) {
        persistSession(latestSession);
      }
      persistTimersRef.current.delete(sessionId);
    }, 500);
    persistTimersRef.current.set(sessionId, timer);
  }, [store]);

  const resolveAiMessageId = useCallback((sessionMap: Map<string, Session>, sessionId: string) => {
    const cached = subSessionMessageMapRef.current.get(sessionId);
    const session = sessionMap.get(sessionId);
    if (!session) return null;
    if (cached) {
      const cachedMessage = session.messages.find((message) => message.id === cached && message.role === 'assistant');
      if (cachedMessage) return cached;
      subSessionMessageMapRef.current.delete(sessionId);
    }
    const assistantMessages = session.messages.filter((message) => message.role === 'assistant');
    const runningAssistant = [...assistantMessages].reverse().find((message) => message.status === 'running');
    const targetMessage = runningAssistant || assistantMessages[assistantMessages.length - 1] || null;
    if (targetMessage) {
      subSessionMessageMapRef.current.set(sessionId, targetMessage.id);
      return targetMessage.id;
    }
    return null;
  }, []);

  const ensureStreamingAssistantMessage = useCallback((
    sessionId: string,
    model: string | undefined,
    startedAt: number,
  ) => {
    const state = store.getState();
    const existingId = resolveAiMessageId(state.sessions, sessionId);
    if (existingId) return existingId;

    const messageId = `${startedAt}-a-resume`;
    state.addMessage(sessionId, {
      id: messageId,
      role: 'assistant',
      model,
      createdAt: startedAt,
      startedAt,
      status: 'running',
      segments: [],
    });
    subSessionMessageMapRef.current.set(sessionId, messageId);
    return messageId;
  }, [resolveAiMessageId, store]);

  const processIncomingChunk = useCallback((
    chunk: ServerEventChunk,
    options?: {
      rootSessionId?: string;
      rootAiMessageId?: string | null;
      model?: string;
      messageMode?: 'normal' | 'build' | 'task' | 'ask' | 'append';
    },
  ) => {
    const liveState = store.getState();
    const targetSessionId = chunk.sessionId;
    const rootSessionId = options?.rootSessionId || targetSessionId;
    const activityAt = chunk.timestamp ?? Date.now();
    lastActivityAtBySessionRef.current.set(targetSessionId, activityAt);
    lastActivityAtBySessionRef.current.set(rootSessionId, activityAt);
    const currentEventId = chunk.eventId || 0;
    const lastSeenEventId = lastEventIdByRootSessionRef.current.get(rootSessionId) || 0;
    if (currentEventId > 0 && currentEventId <= lastSeenEventId) {
      return;
    }
    if (currentEventId > 0) {
      lastEventIdByRootSessionRef.current.set(rootSessionId, currentEventId);
    }

    if (interruptedSessionIdsRef.current.has(targetSessionId) && chunk.type !== 'interrupted') {
      return;
    }

    const rootAiMessageId = options?.rootAiMessageId || (rootSessionId ? resolveAiMessageId(liveState.sessions, rootSessionId) : null);
    const fallbackAiMessageId = rootAiMessageId || resolveAiMessageId(liveState.sessions, targetSessionId);
    if (!fallbackAiMessageId && chunk.type !== 'subagent_start') {
      return;
    }

    if (chunk.type === 'subagent_start') {
      const parentAiMessageId = rootSessionId
        ? (rootAiMessageId || resolveAiMessageId(liveState.sessions, chunk.parentSessionId))
        : resolveAiMessageId(liveState.sessions, chunk.parentSessionId);
      if (!parentAiMessageId) return;

      const reduced = liveState.processChunk(liveState.sessions, chunk.parentSessionId, parentAiMessageId, chunk);
      const newSessions = reduced.sessions;
      store.setState({ sessions: newSessions });
      persistSessions([
        newSessions.get(chunk.parentSessionId),
        newSessions.get(chunk.subSessionId),
      ].filter(Boolean) as Session[]);

      const subAiMessageId = ensureStreamingAssistantMessage(
        chunk.subSessionId,
        options?.model,
        chunk.startedAt,
      );
      subSessionMessageMapRef.current.set(chunk.subSessionId, subAiMessageId);
      return;
    }

    if (chunk.type === 'subagent_end') {
      const subAiMessageId = resolveAiMessageId(liveState.sessions, chunk.subSessionId) || fallbackAiMessageId;
      if (!subAiMessageId) return;
      const reduced = liveState.processChunk(liveState.sessions, chunk.subSessionId, subAiMessageId, chunk);
      store.setState({ sessions: reduced.sessions });
      schedulePersistSession(chunk.subSessionId, true);
      schedulePersistSession(chunk.parentSessionId, true);
      attachedSessionIdsRef.current.delete(chunk.subSessionId);
      return;
    }

    if (chunk.type === 'permission_request') {
      if (permissionStore.getState().config.mode === 'full_auto' || store.getState().composerControls.fullAuto) {
        void approvePermission({ toolId: chunk.toolId, approved: true });
        return;
      }

      if (hasSessionPermissionGrant(liveState.sessions, chunk.sessionId, chunk.toolName)) {
        void approvePermission({ toolId: chunk.toolId, approved: true });
        return;
      }

      permissionStore.getState().addPending({
        toolId: chunk.toolId,
        toolName: chunk.toolName,
        reason: chunk.reason,
        sessionId: chunk.sessionId,
        timestamp: Date.now(),
      });
      const targetAiMessageId = resolveAiMessageId(liveState.sessions, chunk.sessionId) || fallbackAiMessageId;
      if (!targetAiMessageId) return;
      const reduced = liveState.processChunk(liveState.sessions, chunk.sessionId, targetAiMessageId, chunk);
      store.setState({ sessions: reduced.sessions });
      schedulePersistSession(chunk.sessionId, true);

      if (liveState.activeSessionId !== chunk.sessionId) {
        const sessionTitle = liveState.sessions.get(chunk.sessionId)?.title || '子会话';
        useToastStore.getState().addToast({
          type: 'warning',
          category: 'permission',
          message: `${sessionTitle} 需要权限确认`,
          actionLabel: '进入处理',
          autoClose: false,
          position: 'top-right',
          onAction: () => {
            store.getState().setActiveSession(chunk.sessionId);
          },
        });
      }
      return;
    }

    if (chunk.type === 'tool_result' && !chunk.isError) {
      const session = liveState.sessions.get(targetSessionId);
      const workspacePath = session?.workspacePath || getActiveWorkspacePath();
      const toolMessageId = resolveAiMessageId(liveState.sessions, targetSessionId) || fallbackAiMessageId;
      const toolName = session?.messages
        .flatMap((message) => message.segments || [])
        .find((segment) => segment.type === 'tool' && segment.tool.id === chunk.toolId);
      const resolvedToolName = toolName?.type === 'tool' ? toolName.tool.name : undefined;

      if (workspacePath && toolMessageId && resolvedToolName === 'create_spec') {
        void applySpecToolResult({
          workspacePath,
          rawResult: chunk.result,
        }).then((result) => {
          if (!result?.handled || !result.toolMessage) {
            return;
          }
          const latestState = store.getState();
          latestState.updateMessage(targetSessionId, toolMessageId, {
            segments: (latestState.sessions.get(targetSessionId)?.messages.find((message) => message.id === toolMessageId)?.segments || []).map((segment) =>
              segment.type === 'tool' && segment.tool.id === chunk.toolId
                ? {
                    ...segment,
                    tool: {
                      ...segment.tool,
                      result: result.toolMessage,
                    },
                  }
                : segment,
            ),
          });
          if (result.specTitle) {
            latestState.setSessionTitle(targetSessionId, result.specTitle);
          }
          schedulePersistSession(targetSessionId, true);
        }).catch((error) => {
          console.error('Spec tool result handling failed', error);
        });
      }
    }

    const targetAiMessageId = resolveAiMessageId(liveState.sessions, targetSessionId) || fallbackAiMessageId;
    if (!targetAiMessageId) return;
    const reduced = liveState.processChunk(liveState.sessions, targetSessionId, targetAiMessageId, chunk);
    store.setState({ sessions: reduced.sessions });
    schedulePersistSession(targetSessionId, chunk.type === 'done' || chunk.type === 'interrupted' || chunk.type === 'failed');

    if (chunk.type === 'done') {
      attachedSessionIdsRef.current.delete(targetSessionId);
      const isSubSession = Boolean(liveState.sessions.get(targetSessionId)?.parentId);
      const activeSessionId = store.getState().activeSessionId;
      if (activeSessionId !== targetSessionId) {
        store.getState().updateSession(targetSessionId, { hasUnreadCompleted: true });
      }
      if (!isSubSession && options?.messageMode) {
        processQueueAfterDoneRef.current?.(targetSessionId);
      }
    }

    if (chunk.type === 'interrupted') {
      interruptedSessionIdsRef.current.delete(targetSessionId);
      attachedSessionIdsRef.current.delete(targetSessionId);
    }

    if (chunk.type === 'failed') {
      attachedSessionIdsRef.current.delete(targetSessionId);
    }
  }, [ensureStreamingAssistantMessage, permissionStore, resolveAiMessageId, schedulePersistSession, store]);

  const attachToRunningSession = useCallback(async (sessionId: string) => {
    if (attachedSessionIdsRef.current.has(sessionId)) return;
    attachedSessionIdsRef.current.add(sessionId);

    const onEvent = new Channel<ServerEventChunk>();
    onEvent.onmessage = (chunk) => {
      processIncomingChunk(chunk, {
        rootSessionId: sessionId,
        model: store.getState().sessions.get(sessionId)?.messages.find((message) => message.role === 'assistant')?.model,
      });
    };

    try {
      const attached = await attachSessionStream({
        sessionId,
        afterEventId: lastEventIdByRootSessionRef.current.get(sessionId),
      }, onEvent);
      if (!attached) {
        attachedSessionIdsRef.current.delete(sessionId);
      }
    } catch (error) {
      console.error('Attach session stream failed', error);
      attachedSessionIdsRef.current.delete(sessionId);
    }
  }, [processIncomingChunk, store]);

  const connectStream = useCallback(async (
    prompt: string,
    messageMode: 'normal' | 'build' | 'task' | 'ask' | 'append',
    userMode?: Message['mode'],
    attachments: Attachment[] = [],
    targetSessionId?: string,
  ) => {
    const state = store.getState();
    const sessionId = targetSessionId || state.activeSessionId;
    if (!sessionId) return;
    const providerId = state.composerControls.providerId;
    const model = state.composerControls.modelName;
    if (!providerId || !model) {
      useToastStore.getState().addToast({
        type: 'warning',
        message: '请先选择一个模型',
      });
      return;
    }
    const reasoning = state.composerControls.reasoning;
    const permissionMode = state.composerControls.fullAuto ? 'full_auto' : 'default';
    const settings = useSettingsStore.getState().settings;
    const primaryAgents = (settings.agents ?? []).filter((agent) => agent.kinds.includes('primary'));
    const profile = resolveRuntimeProfileForComposerMode(primaryAgents, settings.defaultAgentId, state.composerControls.mode);
    if (state.composerControls.mode === 'Spec' && (!profile || profile.id.toLowerCase() !== 'spec')) {
      useToastStore.getState().addToast({
        type: 'error',
        message: 'Spec 模式未绑定到受限 spec profile，已拒绝发送。',
      });
      return;
    }
    const profileRequest = profile?.permissions.locked
      ? {
          agentId: profile.id,
          permissionMode: profile.permissions.defaultMode as 'default' | 'plan' | 'full_auto' | undefined,
          allowedTools: profile.permissions.allowedTools,
          disallowedTools: profile.permissions.disallowedTools,
        }
      : {
          agentId: profile?.id,
          permissionMode,
          allowedTools: permissionStore.getState().config.allowedTools,
          disallowedTools: permissionStore.getState().config.deniedTools,
        };
    const isFirstTurn = isFirstSessionTurn(state.sessions.get(sessionId), prompt);
    const workspacePath = getActiveWorkspacePath();

    abortRef.current = false;
    attachedSessionIdsRef.current.add(sessionId);
    lastActivityAtBySessionRef.current.set(sessionId, Date.now());
    state.updateSession(sessionId, {
      workspacePath,
      error: null,
      runtime: {
        state: 'starting',
        message: '正在启动会话流。',
        updatedAt: Date.now(),
      },
    });

    const userMsg: Message = {
      id: Date.now().toString() + '-u',
      role: 'user',
      content: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
      attachments,
      mode: userMode || state.composerControls.mode,
      createdAt: Date.now(),
      startedAt: Date.now(),
    };
    state.addMessage(sessionId, userMsg);
    if (isFirstTurn) {
      void generateTitleFromFirstTurn(sessionId, prompt, providerId, model);
    }

    const aiMessageId = Date.now().toString() + '-a';
    subSessionMessageMapRef.current.set(sessionId, aiMessageId);
    state.addMessage(sessionId, {
      id: aiMessageId,
      role: 'assistant',
      model,
      mode: state.composerControls.mode,
      createdAt: Date.now(),
      startedAt: Date.now(),
      status: 'running',
      segments: [],
    });

    const startStreamAttempt = async () => {
      const onEvent = new Channel<ServerEventChunk>();
      onEvent.onmessage = (chunk) => {
        processIncomingChunk(chunk, {
          rootSessionId: sessionId,
          rootAiMessageId: aiMessageId,
          model,
          messageMode,
        });
      };

      await chatStream({
        sessionId,
        prompt: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
        attachments,
        agentId: profileRequest.agentId,
        permissionMode: profileRequest.permissionMode as 'default' | 'plan' | 'full_auto' | undefined,
        allowedTools: profileRequest.allowedTools,
        disallowedTools: profileRequest.disallowedTools,
        providerId,
        model,
        reasoning,
        cwd: workspacePath,
      }, onEvent);
    };

    const startStreamWithRetry = async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await startStreamAttempt();
          return;
        } catch (error) {
          lastError = error;
          if (attempt === 1) {
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 600));
        }
      }
      throw lastError;
    };

    const failStreamStart = (message: string) => {
      attachedSessionIdsRef.current.delete(sessionId);
      const currentState = store.getState();
      const failedAt = Date.now();
      currentState.updateMessage(sessionId, aiMessageId, {
        status: 'completed',
        endedAt: failedAt,
        segments: [{ type: 'text', content: `[Error: ${message || 'Stream connection failed'}]` }],
      });
      currentState.updateSession(sessionId, {
        queueState: 'idle',
        error: message || 'Stream connection failed',
        runtime: {
          state: 'failed',
          reason: 'error',
          message: message || 'Stream connection failed',
          updatedAt: failedAt,
        },
      });
      schedulePersistSession(sessionId, true);
    };

    try {
      await startStreamWithRetry();
    } catch (err) {
      console.error('Stream failed', err);
      const message = err instanceof Error ? err.message : String(err);
      failStreamStart(message);
    }
  }, [store, schedulePersistSession, processIncomingChunk]);

  const processQueueAfterDone = useCallback(async (sessionId: string, _lastMode: 'normal' | 'build' | 'task' | 'ask' | 'append') => {
    const queuedItem = store.getState().dequeueMessage(sessionId);
    if (queuedItem) {
      store.getState().updateSession(sessionId, { queueState: 'processing_queue' });
      await Promise.resolve();
      if (!abortRef.current) {
        connectStream(
          getMessageTextContent(queuedItem.message),
          queuedItem.mode || 'normal',
          queuedItem.message.mode,
          queuedItem.message.attachments || [],
          sessionId,
        );
      }
    } else {
      store.getState().updateSession(sessionId, {
        runtime: {
          state: 'idle',
          updatedAt: Date.now(),
        },
      });
    }
  }, [connectStream, store]);

  useEffect(() => {
    processQueueAfterDoneRef.current = (sessionId: string) => {
      void processQueueAfterDone(sessionId, 'normal');
    };
    return () => {
      processQueueAfterDoneRef.current = null;
    };
  }, [processQueueAfterDone]);

  useEffect(() => {
    const reconnectableStates = new Set([
      'starting',
      'streaming',
      'retrying',
      'backoff_waiting',
      'waiting_for_permission',
      'waiting_for_user',
      'interrupting',
    ]);

    Array.from(sessions.values()).forEach((session) => {
      if (session.parentId) {
        attachedSessionIdsRef.current.delete(session.id);
        return;
      }
      const runtimeState = session.runtime?.state;
      if (!runtimeState || !reconnectableStates.has(runtimeState)) {
        attachedSessionIdsRef.current.delete(session.id);
        return;
      }
      void attachToRunningSession(session.id);
    });
  }, [attachToRunningSession, sessions]);

  useEffect(() => {
    let disposed = false;

    const markSessionDisconnected = (sessionId: string, updatedAt: number) => {
      const liveState = store.getState();
      const session = liveState.sessions.get(sessionId);
      if (!session || !isSessionRunning(session)) return;

      liveState.updateSession(sessionId, {
        queueState: 'idle',
        error: null,
        runtime: {
          state: 'interrupted',
          reason: 'interrupt',
          message: '会话连接已断开，可继续发送新消息。',
          updatedAt,
        },
      });
      schedulePersistSession(sessionId, true);
    };

    const monitorSessions = async () => {
      const reconnectableStates = new Set([
        'starting',
        'streaming',
        'retrying',
        'backoff_waiting',
        'waiting_for_permission',
        'waiting_for_user',
        'interrupting',
      ]);
      const liveSessions = Array.from(store.getState().sessions.values())
        .filter((session) => !session.parentId && session.runtime?.state && reconnectableStates.has(session.runtime.state));
      if (liveSessions.length === 0) return;

      let runtimeSessionIds = new Set<string>();
      let runtimeSessionsAvailable = false;
      try {
        const runtimeSessions = await listRuntimeSessions();
        runtimeSessionIds = new Set(runtimeSessions.map((session) => session.session_id));
        runtimeSessionsAvailable = true;
      } catch (error) {
        console.error('Failed to list runtime sessions', error);
      }

      if (disposed) return;
      const now = Date.now();
      for (const session of liveSessions) {
        const runtimeState = session.runtime?.state;
        const lastActivity = Math.max(
          lastActivityAtBySessionRef.current.get(session.id) || 0,
          session.runtime?.updatedAt || 0,
          session.updatedAt || 0,
        );
        const inactivityMs = now - lastActivity;
        const runtimeExists = runtimeSessionIds.has(session.id);
        const reconnectAfterMs =
          runtimeState === 'starting' ? 12_000
          : runtimeState === 'interrupting' ? 8_000
          : runtimeState === 'waiting_for_permission' || runtimeState === 'waiting_for_user' ? 45_000
          : 20_000;

        if (runtimeSessionsAvailable && !runtimeExists && inactivityMs > 5_000) {
          attachedSessionIdsRef.current.delete(session.id);
          interruptedSessionIdsRef.current.delete(session.id);
          markSessionDisconnected(session.id, now);
          continue;
        }

        if (runtimeExists && inactivityMs > reconnectAfterMs) {
          attachedSessionIdsRef.current.delete(session.id);
          void attachToRunningSession(session.id);
        }
      }
    };

    void monitorSessions();
    const timer = window.setInterval(() => {
      void monitorSessions();
    }, 5_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [attachToRunningSession, schedulePersistSession, store]);

  const requestInterrupt = useCallback(async () => {
    const state = store.getState();
    const targetSessionIds = Array.from(state.sessions.values())
      .filter((session) => isSessionRunning(session))
      .map((session) => session.id);
    if (targetSessionIds.length === 0) return;

    abortRef.current = true;
    for (const targetId of targetSessionIds) {
      interruptedSessionIdsRef.current.add(targetId);
      state.updateSession(targetId, {
        runtime: {
          state: 'interrupting',
          reason: 'interrupt',
          message: '正在请求中断。',
          updatedAt: Date.now(),
        },
      });
    }
    void Promise.all(targetSessionIds.map((targetId) => interruptSession({ sessionId: targetId }))).catch((error) => {
      console.error('Interrupt failed', error);
      for (const targetId of targetSessionIds) {
        interruptedSessionIdsRef.current.delete(targetId);
        state.updateSession(targetId, {
          runtime: {
            state: 'streaming',
            reason: 'unknown',
            message: '中断请求失败，已恢复会话监听。',
            updatedAt: Date.now(),
          },
        });
      }
    });
  }, [store]);

  const submitAnswer = useCallback(async (sessionId: string, toolId: string, answer: string) => {
    await submitUserAnswer({ toolId, answer });
    store.getState().clearAskRequest(sessionId);
  }, [store]);

  const approvePermissionRequest = useCallback(async (sessionId: string, toolId: string, approved: boolean) => {
    await approvePermission({ toolId, approved });
    permissionStore.getState().resolvePending(toolId, approved);
    store.getState().resolvePermissionRequestInTimeline(sessionId, toolId, approved);
  }, [permissionStore, store]);

  return { connectStream, isStreaming, requestInterrupt, submitAnswer, approvePermission: approvePermissionRequest };
};

function isFirstSessionTurn(session: Session | undefined, prompt: string) {
  return !!session && session.messages.length === 0 && prompt.trim().length > 0;
}

const CANONICAL_PROFILE_IDS: Record<'Chat' | 'Spec', string> = {
  Chat: 'chat',
  Spec: 'spec',
};

function resolveRuntimeProfileForComposerMode(
  primaryAgents: BackendAgent[],
  defaultAgentId: BackendSettings['defaultAgentId'],
  mode: 'Chat' | 'Spec',
) {
  const canonicalId = CANONICAL_PROFILE_IDS[mode];
  const canonicalProfile = primaryAgents.find((item) => item.id.toLowerCase() === canonicalId);
  if (canonicalProfile) {
    return canonicalProfile;
  }

  const exactModeProfiles = primaryAgents.filter((item) => item.mode === mode);
  if (exactModeProfiles.length === 1) {
    return exactModeProfiles[0];
  }

  return primaryAgents.find((item) => item.id === defaultAgentId) || null;
}

function getActiveWorkspacePath() {
  const workspaceState = useWorkspaceStore.getState();
  const workspace =
    workspaceState.workspaces.find((item) => item.id === workspaceState.activeWorkspaceId) ||
    workspaceState.workspaces[0];
  return workspace?.path;
}

async function generateTitleFromFirstTurn(
  sessionId: string,
  prompt: string,
  providerId: string,
  model: string,
) {
  const fallbackTitle = `session - ${sessionId.replace(/^session-/, '').slice(-6)}`;
  try {
    const title = await llmComplete({
      providerId,
      model,
      timeoutSecs: 30,
      messages: [
        {
          role: 'user',
          content: `${TITLE_SYSTEM_PROMPT}\n\nGenerate a title for this first user message:\n\n${prompt}`,
        },
      ],
    });
    useSessionStore.getState().setSessionTitle(sessionId, cleanGeneratedTitle(title) || fallbackTitle);
  } catch (error) {
    console.error('Title generation failed', error);
    useSessionStore.getState().setSessionTitle(sessionId, fallbackTitle);
  }
}

function cleanGeneratedTitle(raw: string) {
  return raw
    .split(/\r?\n/)[0]
    .trim()
    .replace(/^["'`“”‘’「」《》]+|["'`“”‘’「」《》]+$/g, '')
    .trim()
    .slice(0, 32);
}
