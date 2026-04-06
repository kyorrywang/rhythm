import { useState, useCallback, useEffect } from 'react';
import { submitUserAnswer } from '@/shared/api/commands';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { useLLMStream } from '@/features/session/hooks/useLLMStream';
import { SessionPhase, SelectionType, AskQuestion, Message } from '@/shared/types/schema';

interface UseComposerActionsParams {
  activeSessionId: string | null;
  phase: SessionPhase;
  currentAsk: { toolId: string; question: string; options: string[]; selectionType?: SelectionType; questions?: AskQuestion[] } | null;
  allTasksDone: boolean;
}

export const useComposerActions = ({ activeSessionId, phase, currentAsk, allTasksDone }: UseComposerActionsParams) => {
  const { enqueueMessage, removeQueuedMessage, clearQueue, getQueueLength, transitionPhase, clearTasks, setTaskMinimized, recordAskAnswer, sessions } = useSessionStore();
  const { connectStream, requestInterrupt } = useLLMStream();

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
    if (allTasksDone && activeSessionId) {
      setTaskMinimized(activeSessionId, true);
    }
  }, [allTasksDone, activeSessionId, setTaskMinimized]);

  useEffect(() => {
    if (phase === 'idle') {
      clearTasks(activeSessionId!);
    }
  }, [phase, activeSessionId, clearTasks]);

  const buildAskAnswer = useCallback((): { answer: string; record: { selected: string[]; text: string } } => {
    if (!currentAsk) {
      const plain = text.trim();
      return {
        answer: plain,
        record: {
          selected: [],
          text: plain,
        },
      };
    }
    const selectionType = currentAsk.selectionType || 'multiple_with_input';
    const input = text.trim();
    const selected = selectedAskOptions.join(',');
    let answer = '';

    switch (selectionType) {
      case 'single_with_input':
      case 'multiple_with_input':
        if (input) {
          answer = selected ? `${selected}: ${input}` : input;
        } else {
          answer = selected;
        }
        break;
      default:
        answer = selected || input;
        break;
    }
    return {
      answer,
      record: {
        selected: [...selectedAskOptions],
        text: input,
      },
    };
  }, [currentAsk, text, selectedAskOptions]);

  const handleSend = useCallback((submission?: { answer: string; record: { selected: string[]; text: string } }) => {
    if (!activeSessionId) return;

    if (phase === 'waiting_for_ask' && currentAsk) {
      const built = submission || buildAskAnswer();
      const answer = built.answer;
      if (!answer) return;

      const session = sessions.get(activeSessionId);
      const lastAiMessage = session?.messages.filter((m: Message) => m.role === 'assistant').pop();

      if (lastAiMessage) {
        recordAskAnswer(activeSessionId, lastAiMessage.id, built.record);
      }

      submitUserAnswer({ toolId: currentAsk.toolId, answer }).catch(console.error);
      setText('');
      setSelectedAskOptions([]);
      return;
    }

    const isSessionStreaming = phase === 'streaming' || phase === 'streaming_with_queue' || phase === 'processing_queue' || phase === 'interrupting' || phase === 'waiting_for_permission';
    if (isSessionStreaming && activeSessionId) {
      enqueueMessage(activeSessionId, {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      }, 'urgent', 'append');
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
  }, [activeSessionId, phase, currentAsk, text, enqueueMessage, connectStream, transitionPhase, buildAskAnswer, recordAskAnswer, sessions]);

  const handleIgnoreAsk = useCallback(() => {
    if (!activeSessionId || !currentAsk) return;

    const session = sessions.get(activeSessionId);
    const lastAiMessage = session?.messages.filter((m: Message) => m.role === 'assistant').pop();

    if (lastAiMessage) {
      recordAskAnswer(activeSessionId, lastAiMessage.id, {
        selected: [],
        text: '',
      });
    }

    submitUserAnswer({ toolId: currentAsk.toolId, answer: '' }).catch(console.error);
    setText('');
    setSelectedAskOptions([]);
  }, [activeSessionId, currentAsk, recordAskAnswer, sessions]);

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

  const handleResetAskOptions = useCallback(() => {
    setSelectedAskOptions([]);
  }, []);

  return {
    text,
    setText,
    selectedAskOptions,
    setSelectedAskOptions,
    handleSend,
    handleIgnoreAsk,
    handleCancelQueue,
    handleRemoveQueuedItem,
    handleInterrupt,
    handleAskOptionToggle,
    handleResetAskOptions,
  };
};
