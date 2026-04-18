import { useState, useCallback, useEffect, useMemo } from 'react';
import { createSession, submitUserAnswer } from '@/platform/tauri/api/commands';
import { useSessionStore } from '@/features/chat/store/useSessionStore';
import { useActiveWorkspace } from '@/features/workspace/store/useWorkspaceStore';
import { useLLMStream } from '@/features/chat/hooks/useLLMStream';
import type { Attachment, AskQuestion, AskResponse, Message, SelectionType, SessionQueueState, StreamRuntimeState } from '@/shared/types/schema';
import { getSessionQueueState, getSessionRuntimeState } from '@/features/chat/utils/sessionState';
import type { ComposerSlashCommand, ComposerSlashState } from '@/features/chat/model/types';
import { filterComposerSlashCommands, parseSlashQuery, splitSlashCommandInput } from '@/features/chat/utils/slashCommands';

interface UseComposerActionsParams {
  activeSessionId: string | null;
  runtimeState: StreamRuntimeState;
  queueState: SessionQueueState;
  currentAsk: { toolId: string; title: string; question: string; options: string[]; selectionType: SelectionType; questions?: AskQuestion[] } | null;
  allTasksDone: boolean;
  composerMode: string;
  availableSlashCommands: Map<string, ComposerSlashCommand>;
}

export const useComposerActions = ({ activeSessionId, runtimeState, queueState, currentAsk, allTasksDone, composerMode, availableSlashCommands }: UseComposerActionsParams) => {
  const activeWorkspace = useActiveWorkspace();
  const { enqueueMessage, removeQueuedMessage, clearQueue, getQueueLength, setQueueState, clearTasks, setTaskMinimized, recordAskAnswer, sessions, addSession, setActiveSession, composerDraft, clearComposerDraft, addMessage } = useSessionStore();
  const { connectStream, requestInterrupt } = useLLMStream();

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedAskOptions, setSelectedAskOptions] = useState<string[]>([]);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  const slashQuery = useMemo(() => parseSlashQuery(text), [text]);
  const filteredSlashCommands = useMemo(
    () => filterComposerSlashCommands(Array.from(availableSlashCommands.values()), slashQuery.query),
    [availableSlashCommands, slashQuery.query],
  );
  const matchedSlashCommand = useMemo(() => {
    const { commandName } = splitSlashCommandInput(text);
    return commandName ? availableSlashCommands.get(commandName) || null : null;
  }, [availableSlashCommands, text]);
  const slashState: ComposerSlashState = useMemo(() => ({
    active: slashQuery.active && !currentAsk && !matchedSlashCommand,
    query: slashQuery.query,
    commands: filteredSlashCommands,
    selectedIndex: filteredSlashCommands.length === 0 ? 0 : Math.min(selectedSlashIndex, filteredSlashCommands.length - 1),
  }), [currentAsk, filteredSlashCommands, matchedSlashCommand, selectedSlashIndex, slashQuery.active, slashQuery.query]);

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

  useEffect(() => {
    setSelectedSlashIndex(0);
  }, [slashQuery.query]);

  useEffect(() => {
    if (filteredSlashCommands.length === 0 && selectedSlashIndex !== 0) {
      setSelectedSlashIndex(0);
      return;
    }
    if (selectedSlashIndex >= filteredSlashCommands.length && filteredSlashCommands.length > 0) {
      setSelectedSlashIndex(filteredSlashCommands.length - 1);
    }
  }, [filteredSlashCommands.length, selectedSlashIndex]);

  const buildAskAnswer = useCallback((): { answer: string; record: AskResponse } => {
    if (!currentAsk) {
      const plain = text.trim();
      return {
        answer: plain,
        record: { answers: [] },
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
        answers: [{
          questionId: currentAsk.questions?.[0]?.id || 'question-1',
          selected: [...selectedAskOptions],
          text: input,
        }],
      },
    };
  }, [currentAsk, text, selectedAskOptions]);

  const handleSend = useCallback((submission?: { answer: string; record: AskResponse }) => {
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

      submitUserAnswer({ toolId: currentAsk.toolId, answer, record: built.record }).catch(console.error);
      setText('');
      setSelectedAskOptions([]);
      return;
    }

    const sendNormalMessage = async () => {
      const ensureTargetSession = async () => {
        let targetSessionId = activeSessionId && sessions.has(activeSessionId) ? activeSessionId : null;
        if (!targetSessionId) {
          const session = await createSession('新会话', activeWorkspace.path);
          addSession(session);
          setActiveSession(session.id);
          targetSessionId = session.id;
        }
        return targetSessionId;
      };

      const appendSystemMessage = async (content: string) => {
        const targetSessionId = await ensureTargetSession();
        addMessage(targetSessionId, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'system',
          content,
          createdAt: Date.now(),
        });
      };

      const parsedSlashInput = splitSlashCommandInput(text);
      const outgoingAttachments = attachments;
      const selectedSlashCommand = (slashState.active
        ? (filteredSlashCommands.find((command) => command.name === parsedSlashInput.commandName) || filteredSlashCommands[slashState.selectedIndex] || null)
        : matchedSlashCommand) || null;

      if (slashState.active && !selectedSlashCommand) {
        await appendSystemMessage(`未找到命令 \`/${parsedSlashInput.commandName || slashQuery.query}\`。`);
        return;
      }

      const trimmed = selectedSlashCommand ? parsedSlashInput.argumentText : text.trim();

      if (!trimmed && outgoingAttachments.length === 0 && !selectedSlashCommand) return;
      const contextPolicy = selectedSlashCommand?.contextPolicy || 'default';
      const slashCommandName = selectedSlashCommand?.name;

      const targetSessionId = await ensureTargetSession();

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
          agentId: composerMode,
          slashCommandName,
          contextPolicy,
          createdAt: Date.now(),
        }, 'urgent', 'append');
        setText('');
        setAttachments([]);
        if (currentRuntimeState === 'streaming' && currentQueueState === 'idle') {
          setQueueState(targetSessionId, 'streaming_with_queue');
        }
        return;
      }

      connectStream(trimmed, 'normal', composerMode, outgoingAttachments, targetSessionId, {
        slashCommandName,
        contextPolicy,
      });
      setText('');
      setAttachments([]);
    };

    void sendNormalMessage();
  }, [activeSessionId, runtimeState, queueState, currentAsk, text, attachments, composerMode, activeWorkspace.path, enqueueMessage, connectStream, setQueueState, buildAskAnswer, recordAskAnswer, sessions, addMessage, addSession, setActiveSession, slashState.active, slashState.selectedIndex, filteredSlashCommands, slashQuery.query, matchedSlashCommand]);

  const handleIgnoreAsk = useCallback(() => {
    if (!activeSessionId || !currentAsk) return;

    const session = sessions.get(activeSessionId);
    const lastAiMessage = session?.messages.filter((m: Message) => m.role === 'assistant').pop();

    if (lastAiMessage) {
      recordAskAnswer(activeSessionId, lastAiMessage.id, { answers: [] });
    }

    submitUserAnswer({ toolId: currentAsk.toolId, answer: '', record: { answers: [] } }).catch(console.error);
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

  const handleSlashNavigate = useCallback((direction: 'up' | 'down') => {
    if (!slashState.active || slashState.commands.length === 0) return;
    setSelectedSlashIndex((current) => {
      if (direction === 'up') {
        return current <= 0 ? slashState.commands.length - 1 : current - 1;
      }
      return current >= slashState.commands.length - 1 ? 0 : current + 1;
    });
  }, [slashState.active, slashState.commands.length]);

  const handleSlashSelect = useCallback((command: ComposerSlashCommand) => {
    setText(`/${command.name} `);
    setSelectedSlashIndex(0);
  }, []);

  const handleSlashConfirm = useCallback(() => {
    if (!slashState.active || slashState.commands.length === 0) return;
    handleSlashSelect(slashState.commands[slashState.selectedIndex]);
  }, [handleSlashSelect, slashState.active, slashState.commands, slashState.selectedIndex]);

  const handleSlashClose = useCallback(() => {
    if (!slashState.active) return;
    setText((currentText) => currentText.startsWith('/') ? '' : currentText);
    setSelectedSlashIndex(0);
  }, [slashState.active]);

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
    slashState,
    handleSlashNavigate,
    handleSlashSelect,
    handleSlashConfirm,
    handleSlashClose,
  };
};


