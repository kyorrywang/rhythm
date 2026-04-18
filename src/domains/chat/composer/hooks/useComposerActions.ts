import { useState, useCallback, useEffect, useMemo } from 'react';
import { createSession, submitUserAnswer } from '@/core/runtime/api/commands';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import { useActiveWorkspace } from '@/core/workspace/useWorkspaceStore';
import { useLLMStream } from '@/domains/chat/session/hooks/useLLMStream';
import { SelectionType, AskQuestion, AskResponse, Message, Attachment, SessionQueueState, StreamRuntimeState } from '@/shared/types/schema';
import { getSessionQueueState, getSessionRuntimeState } from '@/core/sessions/sessionState';
import type { ComposerSlashCommand, ComposerSlashState } from '../types';
import { filterComposerSlashCommands, parseSlashQuery, splitSlashCommandInput } from '../lib/slashCommands';

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
  const [activeSlashCommandName, setActiveSlashCommandName] = useState<string | null>(null);

  const slashQuery = useMemo(() => parseSlashQuery(text), [text]);
  const filteredSlashCommands = useMemo(
    () => filterComposerSlashCommands(Array.from(availableSlashCommands.values()), slashQuery.query),
    [availableSlashCommands, slashQuery.query],
  );
  const activeSlashCommand = useMemo(
    () => (activeSlashCommandName ? availableSlashCommands.get(activeSlashCommandName) || null : null),
    [activeSlashCommandName, availableSlashCommands],
  );
  const slashState: ComposerSlashState = useMemo(() => ({
    active: slashQuery.active && !currentAsk,
    query: slashQuery.query,
    commands: filteredSlashCommands,
    selectedIndex: filteredSlashCommands.length === 0 ? 0 : Math.min(selectedSlashIndex, filteredSlashCommands.length - 1),
  }), [currentAsk, filteredSlashCommands, selectedSlashIndex, slashQuery.active, slashQuery.query]);

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
    if (activeSlashCommandName && !availableSlashCommands.has(activeSlashCommandName)) {
      setActiveSlashCommandName(null);
    }
  }, [activeSlashCommandName, availableSlashCommands]);

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

      if (slashState.active) {
        const { commandName, argumentText } = splitSlashCommandInput(text);
        const exactMatch = filteredSlashCommands.find((command) => command.name === commandName);
        const selectedCommand = exactMatch || filteredSlashCommands[slashState.selectedIndex];

        if (!selectedCommand) {
          await appendSystemMessage(`未找到命令 \`/${commandName || slashQuery.query}\`。`);
          return;
        }

        setActiveSlashCommandName(selectedCommand.name);
        if (!argumentText && attachments.length === 0 && selectedCommand.kind !== 'workflow') {
          setText('');
          setSelectedSlashIndex(0);
          return;
        }
      }

      const trimmed = slashState.active ? splitSlashCommandInput(text).argumentText : text.trim();
      const outgoingAttachments = attachments;
      const resolvedSlashCommand = (slashState.active
        ? (filteredSlashCommands.find((command) => command.name === splitSlashCommandInput(text).commandName) || filteredSlashCommands[slashState.selectedIndex] || activeSlashCommand)
        : activeSlashCommand) || null;
      if (!trimmed && outgoingAttachments.length === 0 && resolvedSlashCommand?.kind !== 'workflow') return;
      const contextPolicy = resolvedSlashCommand?.contextPolicy || 'default';
      const slashCommandName = resolvedSlashCommand?.name;

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
  }, [activeSessionId, runtimeState, queueState, currentAsk, text, attachments, composerMode, activeWorkspace.path, enqueueMessage, connectStream, setQueueState, buildAskAnswer, recordAskAnswer, sessions, addMessage, addSession, setActiveSession, slashState.active, slashState.selectedIndex, filteredSlashCommands, slashQuery.query, activeSlashCommand]);

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

  const handleSlashConfirm = useCallback(() => {
    if (!slashState.active || slashState.commands.length === 0) return;
    handleSend();
  }, [handleSend, slashState.active, slashState.commands.length]);

  const handleSlashClose = useCallback(() => {
    if (!slashState.active) return;
    setText((currentText) => currentText.startsWith('/') ? '' : currentText);
    setSelectedSlashIndex(0);
  }, [slashState.active]);

  const handleClearActiveSlashCommand = useCallback(() => {
    setActiveSlashCommandName(null);
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
    slashState,
    activeSlashCommand,
    handleSlashNavigate,
    handleSlashConfirm,
    handleSlashClose,
    handleClearActiveSlashCommand,
  };
};
