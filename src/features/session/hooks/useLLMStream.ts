import { useState, useCallback } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/useSessionStore';
import { Message, ServerEventChunk } from '@/types/schema';

export const useLLMStream = () => {
  const { addMessage, processChunk, activeSessionId } = useSessionStore();
  const [isStreaming, setIsStreaming] = useState(false);

  const connectStream = useCallback(async (prompt: string, messageMode: Message['mode']) => {
    if (!activeSessionId) return;

    setIsStreaming(true);
    
    // 1. Add User Message
    const userMsg: Message = {
      id: Date.now().toString() + '-u',
      role: 'user',
      content: prompt || (messageMode === 'ask' ? '已提交选项' : '测试任务'),
      mode: messageMode,
      createdAt: Date.now(),
    };
    addMessage(activeSessionId, userMsg);

    // 2. Create initial AI target message (thinking state initially)
    const aiMessageId = Date.now().toString() + '-a';
    const initAiMsg: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      isThinking: true, // start thinking immediately
    };
    addMessage(activeSessionId, initAiMsg);

    try {
      const onEvent = new Channel<ServerEventChunk>();
      onEvent.onmessage = (chunk) => {
        processChunk(activeSessionId, aiMessageId, chunk);
        if (chunk.type === 'done') {
           setIsStreaming(false);
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
    }
  }, [activeSessionId, addMessage, processChunk]);

  return { connectStream, isStreaming };
};
