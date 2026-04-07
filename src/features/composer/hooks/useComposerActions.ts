import { useState, useCallback, useEffect } from 'react';
import { createSession, submitUserAnswer } from '@/shared/api/commands';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { useLLMStream } from '@/features/session/hooks/useLLMStream';
import { SessionPhase, SelectionType, AskQuestion, Message, Attachment } from '@/shared/types/schema';

interface UseComposerActionsParams {
  activeSessionId: string | null;
  phase: SessionPhase;
  currentAsk: { toolId: string; title: string; question: string; options: string[]; selectionType: SelectionType; questions?: AskQuestion[] } | null;
  allTasksDone: boolean;
  composerMode: Message['mode'];
}

export const useComposerActions = ({ activeSessionId, phase, currentAsk, allTasksDone, composerMode }: UseComposerActionsParams) => {
  const { enqueueMessage, removeQueuedMessage, clearQueue, getQueueLength, transitionPhase, clearTasks, setTaskMinimized, recordAskAnswer, sessions, addSession, setActiveSession } = useSessionStore();
  const { connectStream, requestInterrupt } = useLLMStream();

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
    const input = text.trim();
    const selected = selectedAskOptions.join(',');
    const answer = input
      ? selected ? `${selected}: ${input}` : input
      : selected;

    return {
      answer,
      record: {
        selected: [...selectedAskOptions],
        text: input,
      },
    };
  }, [currentAsk, text, selectedAskOptions]);

  const handleSend = useCallback((submission?: { answer: string; record: { selected: string[]; text: string } }) => {
    if (phase === 'waiting_for_ask' && currentAsk) {
      if (!activeSessionId) return;
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

    const sendNormalMessage = async () => {
      const trimmed = text.trim();
      const outgoingAttachments = attachments;
      if (!trimmed && outgoingAttachments.length === 0) return;

      let targetSessionId = activeSessionId;
      if (!targetSessionId) {
        const session = await createSession('新会话');
        addSession(session);
        setActiveSession(session.id);
        targetSessionId = session.id;
      }

      const currentPhase = targetSessionId ? useSessionStore.getState().sessions.get(targetSessionId)?.phase || 'idle' : phase;
      const isSessionStreaming = currentPhase === 'streaming' || currentPhase === 'streaming_with_queue' || currentPhase === 'processing_queue' || currentPhase === 'interrupting' || currentPhase === 'waiting_for_permission';
      if (isSessionStreaming && targetSessionId) {
        enqueueMessage(targetSessionId, {
          id: Date.now().toString(),
          role: 'user',
          content: trimmed,
          attachments: outgoingAttachments,
          mode: composerMode,
          createdAt: Date.now(),
        }, 'urgent', 'append');
        setText('');
        setAttachments([]);
        if (currentPhase === 'streaming') {
          transitionPhase(targetSessionId, 'streaming_with_queue');
        }
        return;
      }

      connectStream(trimmed, 'normal', composerMode, outgoingAttachments);
      setText('');
      setAttachments([]);
    };

    void sendNormalMessage();
  }, [activeSessionId, phase, currentAsk, text, attachments, composerMode, enqueueMessage, connectStream, transitionPhase, buildAskAnswer, recordAskAnswer, sessions]);

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
    const isSingle = currentAsk.selectionType === 'single_with_input';

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

  const handleAddAttachments = useCallback((nextAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...nextAttachments]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  return {
    text,
    setText,
    attachments,
    handleAddAttachments,
    handleRemoveAttachment,
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
