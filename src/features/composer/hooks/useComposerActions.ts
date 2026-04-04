import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/useSessionStore';
import { useLLMStream } from '@/features/session/hooks/useLLMStream';
import { SessionPhase, SelectionType, AskQuestion } from '@/types/schema';

interface UseComposerActionsParams {
  activeSessionId: string | null;
  phase: SessionPhase;
  currentAsk: { toolId: string; question: string; options: string[]; selectionType?: SelectionType; questions?: AskQuestion[] } | null;
  allTasksDone: boolean;
}

export const useComposerActions = ({ activeSessionId, phase, currentAsk, allTasksDone }: UseComposerActionsParams) => {
  const { enqueueMessage, clearAskRequest, removeQueuedMessage, clearQueue, getQueueLength, transitionPhase, clearTasks, toggleTaskMinimized, recordAskAnswer } = useSessionStore();
  const { connectStream, isStreaming, requestInterrupt } = useLLMStream();

  const [text, setText] = useState('');
  const [selectedAskOptions, setSelectedAskOptions] = useState<string[]>([]);

  useEffect(() => {
    if (currentAsk && phase !== 'waiting_for_ask') {
      transitionPhase(activeSessionId!, 'waiting_for_ask');
      setSelectedAskOptions([]);
      setText('');
    }
  }, [currentAsk?.toolId, phase, activeSessionId, transitionPhase]);

  useEffect(() => {
    if (allTasksDone) {
      toggleTaskMinimized();
    }
  }, [allTasksDone]);

  useEffect(() => {
    if (phase === 'idle') {
      clearTasks(activeSessionId!);
    }
  }, [phase, activeSessionId, clearTasks]);

  const buildAskAnswer = useCallback((): string => {
    if (!currentAsk) return text.trim();
    const selectionType = currentAsk.selectionType || 'multiple_with_input';
    const input = text.trim();
    const selected = selectedAskOptions.join(',');

    switch (selectionType) {
      case 'single_with_input':
      case 'multiple_with_input':
        if (input) {
          return selected ? `${selected}: ${input}` : input;
        }
        return selected;
      default:
        return selected || input;
    }
  }, [currentAsk, text, selectedAskOptions]);

  const handleSend = useCallback(() => {
    if (!activeSessionId) return;

    if (phase === 'waiting_for_ask' && currentAsk) {
      const answer = buildAskAnswer();
      if (!answer) return;

      const state = useSessionStore.getState();
      const session = state.sessions.find(s => s.id === activeSessionId);
      const lastAiMessage = session?.messages.filter(m => m.role === 'assistant').pop();

      if (lastAiMessage) {
        recordAskAnswer(activeSessionId, lastAiMessage.id, {
          selected: selectedAskOptions,
          text: text.trim(),
        });
      }

      invoke('submit_user_answer', { sessionId: activeSessionId, answer }).catch(console.error);
      setText('');
      setSelectedAskOptions([]);
      return;
    }

    if (isStreaming && activeSessionId) {
      enqueueMessage(activeSessionId, {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        mode: 'append',
        createdAt: Date.now(),
      }, 'urgent');
      setText('');
      if (phase === 'streaming') {
        transitionPhase(activeSessionId, 'streaming_with_queue');
      }
      return;
    }

    if (text.trim()) {
      connectStream(text, 'normal');
      setText('');
    }
  }, [activeSessionId, phase, currentAsk, text, selectedAskOptions, isStreaming, enqueueMessage, clearAskRequest, connectStream, transitionPhase, buildAskAnswer, recordAskAnswer]);

  const handleIgnoreAsk = useCallback(() => {
    if (!activeSessionId || !currentAsk) return;

    const state = useSessionStore.getState();
    const session = state.sessions.find(s => s.id === activeSessionId);
    const lastAiMessage = session?.messages.filter(m => m.role === 'assistant').pop();

    if (lastAiMessage) {
      recordAskAnswer(activeSessionId, lastAiMessage.id, {
        selected: [],
        text: '',
      });
    }

    invoke('submit_user_answer', { sessionId: activeSessionId, answer: '' }).catch(console.error);
    setText('');
    setSelectedAskOptions([]);
  }, [activeSessionId, currentAsk, recordAskAnswer]);

  const handleCancelQueue = useCallback(() => {
    if (!activeSessionId) return;
    clearQueue(activeSessionId);
    if (phase === 'streaming_with_queue' || phase === 'processing_queue' || phase === 'interrupting') {
      transitionPhase(activeSessionId, 'streaming');
    }
  }, [activeSessionId, phase, clearQueue, transitionPhase]);

  const handleRemoveQueuedItem = useCallback((queuedId: string) => {
    if (!activeSessionId) return;
    removeQueuedMessage(activeSessionId, queuedId);
    const remaining = getQueueLength(activeSessionId) - 1;
    if (remaining <= 0 && (phase === 'streaming_with_queue' || phase === 'processing_queue' || phase === 'interrupting')) {
      transitionPhase(activeSessionId, 'streaming');
    }
  }, [activeSessionId, phase, removeQueuedMessage, getQueueLength, transitionPhase]);

  const handleInterrupt = useCallback(() => {
    requestInterrupt();
  }, [requestInterrupt]);

  const handleAskOptionToggle = useCallback((opt: string) => {
    if (!currentAsk) return;
    const selectionType = currentAsk.selectionType || 'multiple_with_input';
    const isSingle = selectionType === 'single_with_input';

    if (isSingle) {
      setSelectedAskOptions([opt]);
    } else {
      setSelectedAskOptions(prev =>
        prev.includes(opt) ? prev.filter(p => p !== opt) : [...prev, opt]
      );
    }
  }, [currentAsk]);

  return {
    text,
    setText,
    selectedAskOptions,
    setSelectedAskOptions,
    isStreaming,
    handleSend,
    handleIgnoreAsk,
    handleCancelQueue,
    handleRemoveQueuedItem,
    handleInterrupt,
    handleAskOptionToggle,
    buildAskAnswer,
  };
};
