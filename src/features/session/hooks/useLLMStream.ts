import { useState, useCallback, useRef } from 'react';
import { Channel } from '@tauri-apps/api/core';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { usePermissionStore } from '@/shared/state/usePermissionStore';
import { useToast } from '@/shared/hooks/useToast';
import { Message, ServerEventChunk } from '@/shared/types/schema';
import { chatStream, submitUserAnswer, approvePermission, interruptSession } from '@/shared/api/commands';

export const useLLMStream = () => {
  const store = useSessionStore;
  const permissionStore = usePermissionStore;
  const { error: showError } = useToast();

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(false);
  const rootSessionIdRef = useRef<string | null>(null);
  const rootAiMessageIdRef = useRef<string | null>(null);
  const subSessionMessageMapRef = useRef<Map<string, string>>(new Map());

  const connectStream = useCallback(async (prompt: string, messageMode: 'normal' | 'build' | 'task' | 'ask' | 'append') => {
    const state = store.getState();
    const sessionId = state.activeSessionId;
    if (!sessionId) return;

    abortRef.current = false;
    rootSessionIdRef.current = sessionId;
    setIsStreaming(true);
    state.updateSession(sessionId, { phase: 'streaming' });

    const userMsg: Message = {
      id: Date.now().toString() + '-u',
      role: 'user',
      content: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
      createdAt: Date.now(),
    };
    state.addMessage(sessionId, userMsg);

    const aiMessageId = Date.now().toString() + '-a';
    rootAiMessageIdRef.current = aiMessageId;
    state.addMessage(sessionId, {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      segments: [],
    });

    try {
      const onEvent = new Channel<ServerEventChunk>();
      onEvent.onmessage = (chunk) => {
        const liveState = store.getState();
        const targetSessionId = chunk.sessionId;

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
          permissionStore.getState().addPending({
            toolId: chunk.toolId,
            toolName: chunk.toolName,
            reason: chunk.reason,
            sessionId: chunk.sessionId,
            timestamp: Date.now(),
          });
          state.updateSession(chunk.sessionId, { phase: 'waiting_for_permission', permissionPending: true });
          return;
        }

        if (chunk.type === 'max_turns_exceeded') {
          showError(`已达到最大轮次限制 (${chunk.turns} 轮)`);
          state.updateSession(chunk.sessionId, {
            phase: 'idle',
            maxTurnsReached: chunk.turns,
            error: null,
          });
          setIsStreaming(false);
          return;
        }

        const targetAiMessageId = subSessionMessageMapRef.current.get(targetSessionId) || aiMessageId;
        const reduced = liveState.processChunk(liveState.sessions, targetSessionId, targetAiMessageId, chunk);
        store.setState({ sessions: reduced.sessions });

        if (chunk.type === 'done') {
          const isSubSession = subSessionMessageMapRef.current.has(targetSessionId);
          if (!isSubSession) {
            processQueueAfterDone(targetSessionId, messageMode);
          }
        }

        if (chunk.type === 'interrupted') {
          state.updateSession(targetSessionId, { phase: 'idle' });
          setIsStreaming(false);
        }
      };

      await chatStream({ sessionId, prompt: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务') }, onEvent);
    } catch (err) {
      console.error('Stream failed', err);
      setIsStreaming(false);
      const currentState = store.getState();
      const currentSessionId = currentState.activeSessionId || sessionId;
      currentState.updateSession(currentSessionId, {
        phase: 'idle',
        maxTurnsReached: null,
        error: 'Stream connection failed',
      });
    }
  }, [store, permissionStore, showError]);

  const processQueueAfterDone = useCallback(async (sessionId: string, _lastMode: 'normal' | 'build' | 'task' | 'ask' | 'append') => {
    const queuedItem = store.getState().dequeueMessage(sessionId);
    if (queuedItem) {
      store.getState().updateSession(sessionId, { phase: 'processing_queue' });
      await Promise.resolve();
      if (!abortRef.current) {
        connectStream(queuedItem.message.content || '', queuedItem.mode || 'normal');
      }
    } else {
      setIsStreaming(false);
      store.getState().updateSession(sessionId, { phase: 'idle', maxTurnsReached: null });
    }
  }, [connectStream, store]);

  const requestInterrupt = useCallback(async () => {
    const state = store.getState();
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    const session = state.sessions.get(sessionId);
    const isRunning = session?.phase && session.phase !== 'idle';
    if (!isRunning) return;
    await interruptSession({ sessionId });
    state.updateSession(sessionId, { phase: 'interrupting' });
  }, [store]);

  const submitAnswer = useCallback(async (sessionId: string, toolId: string, answer: string) => {
    await submitUserAnswer({ toolId, answer });
    store.getState().clearAskRequest(sessionId);
  }, [store]);

  const approvePermissionRequest = useCallback(async (sessionId: string, toolId: string, approved: boolean) => {
    await approvePermission({ toolId, approved });
    permissionStore.getState().resolvePending(toolId, approved);
    store.getState().updateSession(sessionId, {
      phase: 'streaming',
      permissionPending: false,
      maxTurnsReached: null,
    });
  }, [permissionStore, store]);

  return { connectStream, isStreaming, requestInterrupt, submitAnswer, approvePermission: approvePermissionRequest };
};
