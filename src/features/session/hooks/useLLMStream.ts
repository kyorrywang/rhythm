import { useState, useCallback, useRef } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/useSessionStore';
import { Message, ServerEventChunk } from '@/types/schema';

export const useLLMStream = () => {
  const { addMessage, processChunk, dequeueMessage, getQueueLength, transitionPhase, migrateQueueToChild, restoreQueueToParent } = useSessionStore();
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(false);
  const rootSessionIdRef = useRef<string | null>(null);
  const rootAiMessageIdRef = useRef<string | null>(null);
  const subSessionMessageMapRef = useRef<Map<string, string>>(new Map());

  const connectStream = useCallback(async (prompt: string, messageMode: 'normal' | 'build' | 'task' | 'ask' | 'append') => {
    const state = useSessionStore.getState();
    const sessionId = state.activeSessionId;
    if (!sessionId) return;

    abortRef.current = false;
    rootSessionIdRef.current = sessionId;
    setIsStreaming(true);
    transitionPhase(sessionId, 'streaming');

    const userMsg: Message = {
      id: Date.now().toString() + '-u',
      role: 'user',
      content: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
      createdAt: Date.now(),
    };
    addMessage(sessionId, userMsg);

    const aiMessageId = Date.now().toString() + '-a';
    rootAiMessageIdRef.current = aiMessageId;
    const initAiMsg: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      segments: [],
    };
    addMessage(sessionId, initAiMsg);

    try {
      const onEvent = new Channel<ServerEventChunk>();
      onEvent.onmessage = (chunk) => {
        const targetSessionId = chunk.sessionId;

        if (chunk.type === 'subagent_start') {
          processChunk(targetSessionId, aiMessageId, chunk);
          migrateQueueToChild(chunk.parentSessionId, chunk.subSessionId);

          const subAiMessageId = Date.now().toString() + '-a-sub';
          addMessage(chunk.subSessionId, {
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
          processChunk(chunk.subSessionId, subAiMessageId, chunk);

          const afterState = useSessionStore.getState();
          const parentSession = afterState.sessions.find(s => s.id === chunk.subSessionId)?.parentId;
          if (parentSession) {
            restoreQueueToParent(chunk.subSessionId, parentSession);
          }
          return;
        }

        const targetAiMessageId = subSessionMessageMapRef.current.get(targetSessionId) || aiMessageId;
        processChunk(targetSessionId, targetAiMessageId, chunk);

        // Only trigger queue processing for the root session.
        // Sub-session done is handled by the subsequent subagent_end event
        // which calls restoreQueueToParent.
        const isSubSession = subSessionMessageMapRef.current.has(targetSessionId);
        if (!isSubSession && (chunk.type === 'done' || chunk.type === 'interrupted')) {
          if (chunk.type === 'interrupted') {
            transitionPhase(targetSessionId, 'interrupting');
          }
          processQueueAfterDone(targetSessionId, messageMode);
        }
      };

      await invoke('chat_stream', {
        sessionId,
        prompt: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
        onEvent
      });

    } catch (err) {
      console.error("Stream failed", err);
      setIsStreaming(false);
      const currentState = useSessionStore.getState();
      const currentSessionId = currentState.activeSessionId || sessionId;
      transitionPhase(currentSessionId, 'idle');
    }
  }, [addMessage, processChunk, dequeueMessage, transitionPhase, migrateQueueToChild, restoreQueueToParent]);

  const processQueueAfterDone = useCallback(async (sessionId: string, _lastMode: 'normal' | 'build' | 'task' | 'ask' | 'append') => {
    const queuedItem = dequeueMessage(sessionId);
    if (queuedItem) {
      transitionPhase(sessionId, 'processing_queue');
      await microtaskDelay();
      if (!abortRef.current) {
        connectStream(queuedItem.message.content || '', queuedItem.mode || 'normal');
      }
    } else {
      setIsStreaming(false);
      transitionPhase(sessionId, 'idle');
    }
  }, [dequeueMessage, transitionPhase, connectStream]);

  const requestInterrupt = useCallback(async () => {
    const state = useSessionStore.getState();
    const sessionId = state.activeSessionId;
    if (!sessionId) return;
    const queueLen = getQueueLength(sessionId);
    if (queueLen === 0) return;
    await invoke('interrupt_session', { sessionId });
    transitionPhase(sessionId, 'interrupting');
  }, [getQueueLength, transitionPhase]);

  return { connectStream, isStreaming, requestInterrupt };
};

function microtaskDelay(): Promise<void> {
  return Promise.resolve();
}
