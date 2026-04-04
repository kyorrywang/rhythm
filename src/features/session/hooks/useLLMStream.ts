import { useState, useCallback, useRef } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/useSessionStore';
import { Message, ServerEventChunk } from '@/types/schema';

export const useLLMStream = () => {
  const { addMessage, processChunk, activeSessionId, dequeueMessage, getQueueLength, transitionPhase } = useSessionStore();
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(false);

  const connectStream = useCallback(async (prompt: string, messageMode: Message['mode']) => {
    if (!activeSessionId) return;

    abortRef.current = false;
    setIsStreaming(true);
    transitionPhase(activeSessionId, 'streaming');
    
    const userMsg: Message = {
      id: Date.now().toString() + '-u',
      role: 'user',
      content: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
      mode: messageMode,
      createdAt: Date.now(),
    };
    addMessage(activeSessionId, userMsg);

    const aiMessageId = Date.now().toString() + '-a';
    const initAiMsg: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      isThinking: true,
    };
    addMessage(activeSessionId, initAiMsg);

    try {
      const onEvent = new Channel<ServerEventChunk>();
      onEvent.onmessage = (chunk) => {
        processChunk(activeSessionId, aiMessageId, chunk);
        if (chunk.type === 'done' || chunk.type === 'interrupted') {
          if (chunk.type === 'interrupted') {
            transitionPhase(activeSessionId, 'processing_queue');
          }
          processQueueAfterDone(activeSessionId, messageMode);
        }
      };

      await invoke('chat_stream', {
        sessionId: activeSessionId,
        prompt: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
        onEvent
      });
      
    } catch (err) {
      console.error("Stream failed", err);
      setIsStreaming(false);
      if (activeSessionId) {
        transitionPhase(activeSessionId, 'idle');
      }
    }
  }, [activeSessionId, addMessage, processChunk, dequeueMessage, transitionPhase]);

  const processQueueAfterDone = useCallback(async (sessionId: string, _lastMode: Message['mode']) => {
    const queuedItem = dequeueMessage(sessionId);
    if (queuedItem) {
      transitionPhase(sessionId, 'processing_queue');
      await microtaskDelay();
      if (!abortRef.current) {
        connectStream(queuedItem.message.content, queuedItem.message.mode);
      }
    } else {
      setIsStreaming(false);
      transitionPhase(sessionId, 'idle');
    }
  }, [dequeueMessage, transitionPhase, connectStream]);

  const requestInterrupt = useCallback(async () => {
    if (!activeSessionId) return;
    const queueLen = getQueueLength(activeSessionId);
    if (queueLen === 0) return;
    await invoke('interrupt_session', { sessionId: activeSessionId });
    transitionPhase(activeSessionId, 'interrupting');
  }, [activeSessionId, getQueueLength, transitionPhase]);

  return { connectStream, isStreaming, requestInterrupt };
};

function microtaskDelay(): Promise<void> {
  return Promise.resolve();
}
