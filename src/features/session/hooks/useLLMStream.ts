import { useState, useCallback, useRef } from 'react';
import { Channel } from '@tauri-apps/api/core';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { usePermissionStore } from '@/shared/state/usePermissionStore';
import { useToastStore } from '@/shared/state/useToastStore';
import { Attachment, Message, ServerEventChunk } from '@/shared/types/schema';
import { chatStream, submitUserAnswer, approvePermission, interruptSession } from '@/shared/api/commands';

export const useLLMStream = () => {
  const store = useSessionStore;
  const permissionStore = usePermissionStore;

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(false);
  const interruptedSessionIdsRef = useRef<Set<string>>(new Set());
  const rootSessionIdRef = useRef<string | null>(null);
  const rootAiMessageIdRef = useRef<string | null>(null);
  const subSessionMessageMapRef = useRef<Map<string, string>>(new Map());

  const connectStream = useCallback(async (
    prompt: string,
    messageMode: 'normal' | 'build' | 'task' | 'ask' | 'append',
    userMode?: Message['mode'],
    attachments: Attachment[] = [],
  ) => {
    const state = store.getState();
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    const providerId = state.composerControls.providerId;
    const model = state.composerControls.modelName;
    const reasoning = state.composerControls.reasoning;
    const mode = state.composerControls.mode === 'Coordinate' ? 'coordinate' : 'chat';
    const permissionMode = state.composerControls.fullAuto ? 'full_auto' : 'default';

    abortRef.current = false;
    rootSessionIdRef.current = sessionId;
    setIsStreaming(true);
    state.updateSession(sessionId, { phase: 'streaming' });

    const userMsg: Message = {
      id: Date.now().toString() + '-u',
      role: 'user',
      content: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
      attachments,
      mode: userMode || state.composerControls.mode,
      createdAt: Date.now(),
    };
    state.addMessage(sessionId, userMsg);

    const aiMessageId = Date.now().toString() + '-a';
    rootAiMessageIdRef.current = aiMessageId;
    state.addMessage(sessionId, {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      model,
      createdAt: Date.now(),
      segments: [],
    });

    try {
      const onEvent = new Channel<ServerEventChunk>();
      onEvent.onmessage = (chunk) => {
        const liveState = store.getState();
        const targetSessionId = chunk.sessionId;

        if (interruptedSessionIdsRef.current.has(targetSessionId) && chunk.type !== 'interrupted') {
          return;
        }

        if (chunk.type === 'subagent_start') {
          const reduced = liveState.processChunk(liveState.sessions, targetSessionId, aiMessageId, chunk);
          let newSessions = reduced.sessions;
          newSessions = liveState.migrateQueueToChild(chunk.parentSessionId, chunk.subSessionId, newSessions);
          store.setState({ sessions: newSessions });

          const subAiMessageId = Date.now().toString() + '-a-sub';
          store.getState().addMessage(chunk.subSessionId, {
            id: subAiMessageId,
            role: 'assistant',
            content: '',
            model,
            createdAt: Date.now(),
            segments: [],
          });
          subSessionMessageMapRef.current.set(chunk.subSessionId, subAiMessageId);
          return;
        }

        if (chunk.type === 'subagent_end') {
          const subAiMessageId = subSessionMessageMapRef.current.get(chunk.subSessionId) || aiMessageId;
          const reduced = liveState.processChunk(liveState.sessions, chunk.subSessionId, subAiMessageId, chunk);
          store.setState({ sessions: reduced.sessions });
          const parentSessionId = reduced.sessions.get(chunk.subSessionId)?.parentId;
          if (parentSessionId) {
            const newSessions = store.getState().restoreQueueToParent(chunk.subSessionId, parentSessionId, reduced.sessions);
            store.setState({ sessions: newSessions });
          }
          return;
        }

        if (chunk.type === 'permission_request') {
          if (permissionStore.getState().config.mode === 'full_auto' || store.getState().composerControls.fullAuto) {
            void approvePermission({ toolId: chunk.toolId, approved: true });
            return;
          }

          const sessionGrants = liveState.sessions.get(chunk.sessionId)?.permissionGrants ?? [];
          if (sessionGrants.includes(chunk.toolName)) {
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
          const targetAiMessageId = subSessionMessageMapRef.current.get(chunk.sessionId) || aiMessageId;
          const reduced = liveState.processChunk(liveState.sessions, chunk.sessionId, targetAiMessageId, chunk);
          store.setState({ sessions: reduced.sessions });

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

        const targetAiMessageId = subSessionMessageMapRef.current.get(targetSessionId) || aiMessageId;
        const reduced = liveState.processChunk(liveState.sessions, targetSessionId, targetAiMessageId, chunk);
        store.setState({ sessions: reduced.sessions });

        if (chunk.type === 'done') {
          const isSubSession = subSessionMessageMapRef.current.has(targetSessionId);
          const activeSessionId = store.getState().activeSessionId;
          if (activeSessionId !== targetSessionId) {
            store.getState().updateSession(targetSessionId, { hasUnreadCompleted: true });
          }
          if (!isSubSession) {
            processQueueAfterDone(targetSessionId, messageMode);
          }
        }

        if (chunk.type === 'interrupted') {
          interruptedSessionIdsRef.current.delete(targetSessionId);
          store.getState().updateSession(targetSessionId, { phase: 'idle' });
          setIsStreaming(false);
        }
      };

      await chatStream({
        sessionId,
        prompt: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
        attachments,
        permissionMode,
        providerId,
        model,
        reasoning,
        mode,
      }, onEvent);
    } catch (err) {
      console.error('Stream failed', err);
      setIsStreaming(false);
      const currentState = store.getState();
      const currentSessionId = currentState.activeSessionId || sessionId;
      currentState.updateSession(currentSessionId, {
        phase: 'idle',
        error: 'Stream connection failed',
      });
    }
  }, [store, permissionStore]);

  const processQueueAfterDone = useCallback(async (sessionId: string, _lastMode: 'normal' | 'build' | 'task' | 'ask' | 'append') => {
    const queuedItem = store.getState().dequeueMessage(sessionId);
    if (queuedItem) {
      store.getState().updateSession(sessionId, { phase: 'processing_queue' });
      await Promise.resolve();
      if (!abortRef.current) {
        connectStream(queuedItem.message.content || '', queuedItem.mode || 'normal', queuedItem.message.mode, queuedItem.message.attachments || []);
      }
    } else {
      setIsStreaming(false);
      store.getState().updateSession(sessionId, { phase: 'idle' });
    }
  }, [connectStream, store]);

  const requestInterrupt = useCallback(async () => {
    const state = store.getState();
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    const session = state.sessions.get(sessionId);
    const isRunning = session?.phase && session.phase !== 'idle';
    if (!isRunning) return;

    abortRef.current = true;
    interruptedSessionIdsRef.current.add(sessionId);
    for (const childSessionId of subSessionMessageMapRef.current.keys()) {
      interruptedSessionIdsRef.current.add(childSessionId);
    }
    state.updateSession(sessionId, { phase: 'interrupting' });
    void interruptSession({ sessionId }).catch((error) => {
      console.error('Interrupt failed', error);
      interruptedSessionIdsRef.current.delete(sessionId);
      for (const childSessionId of subSessionMessageMapRef.current.keys()) {
        interruptedSessionIdsRef.current.delete(childSessionId);
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
    store.getState().updateSession(sessionId, {
      phase: 'streaming',
      permissionPending: false,
    });
  }, [permissionStore, store]);

  return { connectStream, isStreaming, requestInterrupt, submitAnswer, approvePermission: approvePermissionRequest };
};
