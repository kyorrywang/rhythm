import { useState, useCallback, useEffect } from 'react';
import { createSession, submitUserAnswer } from '@/core/runtime/api/commands';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import { useActiveWorkspace } from '@/core/workspace/useWorkspaceStore';
import { useLLMStream } from '@/domains/chat/session/hooks/useLLMStream';
import { SelectionType, AskQuestion, Message, Attachment, SessionQueueState, StreamRuntimeState } from '@/shared/types/schema';
import { getSessionQueueState, getSessionRuntimeState } from '@/core/sessions/sessionState';

interface UseComposerActionsParams {
  activeSessionId: string | null;
  runtimeState: StreamRuntimeState;
  queueState: SessionQueueState;
  currentAsk: { toolId: string; title: string; question: string; options: string[]; selectionType: SelectionType; questions?: AskQuestion[] } | null;
  allTasksDone: boolean;
  composerMode: Message['mode'];
}

export const useComposerActions = ({ activeSessionId, runtimeState, queueState, currentAsk, allTasksDone, composerMode }: UseComposerActionsParams) => {
  const activeWorkspace = useActiveWorkspace();
  const { enqueueMessage, removeQueuedMessage, clearQueue, getQueueLength, setQueueState, clearTasks, setTaskMinimized, recordAskAnswer, sessions, addSession, setActiveSession, composerDraft, clearComposerDraft } = useSessionStore();
  const { connectStream, requestInterrupt } = useLLMStream();

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedAskOptions, setSelectedAskOptions] = useState<string[]>([]);

  useEffect(() => {
    if (currentAsk && runtimeState !== 'waiting_for_user') {
      setSelectedAskOptions([]);
      setText('');
    }
  }, [currentAsk?.toolId, runtimeState]);

  useEffect(() => {
    if (allTasksDone && activeSessionId) {
      setTaskMinimized(activeSessionId, true);
    }
  }, [allTasksDone, activeSessionId, setTaskMinimized]);

  useEffect(() => {
    if (runtimeState === 'idle') {
      clearTasks(activeSessionId!);
    }
  }, [runtimeState, activeSessionId, clearTasks]);

  useEffect(() => {
    if (!composerDraft) return;
    setText(composerDraft.text);
    setAttachments(composerDraft.attachments);
    clearComposerDraft();
  }, [composerDraft, clearComposerDraft]);

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
    if (runtimeState === 'waiting_for_user' && currentAsk) {
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

      let targetSessionId = activeSessionId && sessions.has(activeSessionId) ? activeSessionId : null;
      if (!targetSessionId) {
        const session = await createSession('新会话', activeWorkspace.path);
        addSession(session);
        setActiveSession(session.id);
        targetSessionId = session.id;
      }

      const currentRuntimeState = targetSessionId
        ? getSessionRuntimeState(useSessionStore.getState().sessions.get(targetSessionId))
        : runtimeState;
      const currentQueueState = targetSessionId
        ? getSessionQueueState(useSessionStore.getState().sessions.get(targetSessionId))
        : queueState;
      const isSessionStreaming =
        currentRuntimeState === 'starting'
        || currentRuntimeState === 'streaming'
        || currentRuntimeState === 'backoff_waiting'
        || currentRuntimeState === 'retrying'
        || currentRuntimeState === 'interrupting'
        || currentRuntimeState === 'waiting_for_permission';
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
        if (currentRuntimeState === 'streaming' && currentQueueState === 'idle') {
          setQueueState(targetSessionId, 'streaming_with_queue');
        }
        return;
      }

      connectStream(trimmed, 'normal', composerMode, outgoingAttachments, targetSessionId);
      setText('');
      setAttachments([]);
    };

    void sendNormalMessage();
  }, [activeSessionId, runtimeState, queueState, currentAsk, text, attachments, composerMode, activeWorkspace.path, enqueueMessage, connectStream, setQueueState, buildAskAnswer, recordAskAnswer, sessions]);

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
    if (queueState === 'streaming_with_queue' || queueState === 'processing_queue' || queueState === 'interrupting') {
      setQueueState(activeSessionId, 'idle');
    }
  }, [activeSessionId, queueState, clearQueue, setQueueState]);

  const handleRemoveQueuedItem = useCallback((queuedId: string) => {
    if (!activeSessionId) return;
    removeQueuedMessage(activeSessionId, queuedId);
    const remaining = getQueueLength(activeSessionId) - 1;
    if (remaining <= 0 && (queueState === 'streaming_with_queue' || queueState === 'processing_queue' || queueState === 'interrupting')) {
      setQueueState(activeSessionId, 'idle');
    }
  }, [activeSessionId, queueState, removeQueuedMessage, getQueueLength, setQueueState]);

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
