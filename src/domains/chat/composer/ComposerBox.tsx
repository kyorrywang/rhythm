import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import { usePermissionStore } from '@/core/permissions/usePermissionStore';
import { approvePermission, listSlashCommands } from '@/core/runtime/api/commands';
import { useSettingsStore } from '@/core/runtime/useSettingsStore';
import { useToastStore } from '@/ui/state/useToastStore';
import { useActiveWorkspace } from '@/core/workspace/useWorkspaceStore';
import { useComposerActions } from './hooks/useComposerActions';
import { derivePendingItems } from './lib/derivePendingItems';
import { normalizeSlashCommands } from './lib/slashCommands';
import { AskDock } from './components/AskDock';
import { MainComposer } from './components/MainComposer';
import { TaskDock } from './components/TaskDock';
import { AppendDock } from './components/AppendDock';
import { getCurrentAsk, getCurrentTasks, getSessionQueueState, getSessionRuntimeState } from '@/core/sessions/sessionState';
import type { ComposerSlashCommand } from './types';

export const ComposerBox = () => {
  const {
    activeSessionId,
    sessions,
    toggleTaskMinimized,
    toggleAppendMinimized,
    composerControls,
    setComposerControls,
    resolvePermissionRequestInTimeline,
    updateSession,
  } = useSessionStore();
  const activeWorkspace = useActiveWorkspace();
  const setPermissionConfig = usePermissionStore((s) => s.setConfig);
  const pendingPermissions = usePermissionStore((s) => s.pendingPermissions);
  const providers = useSettingsStore((s) => s.settings.providers ?? []);
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;
  const currentAsk = getCurrentAsk(activeSession);
  const currentTasks = getCurrentTasks(activeSession);
  const runtimeState = getSessionRuntimeState(activeSession);
  const queueState = getSessionQueueState(activeSession);
  const isTaskMinimized = activeSession?.taskDockMinimized ?? false;
  const isAppendMinimized = activeSession?.appendDockMinimized ?? false;
  const hasTasks = !!(currentTasks && currentTasks.length > 0);
  const allTasksDone: boolean = hasTasks && currentTasks!.every((t: { status: string }) => t.status === 'completed');
  const pendingItems = derivePendingItems(activeSession, Array.from(pendingPermissions.values()));
  const [availableSlashCommands, setAvailableSlashCommands] = useState<ComposerSlashCommand[]>([]);
  const warningSignatureRef = useRef('');

  useEffect(() => {
    let disposed = false;

    void listSlashCommands(activeWorkspace.path)
      .then((registry) => {
        if (disposed) return;
        setAvailableSlashCommands(normalizeSlashCommands(registry.commands));
        const signature = registry.warnings.join('|');
        if (signature && signature !== warningSignatureRef.current) {
          warningSignatureRef.current = signature;
          useToastStore.getState().addToast({
            type: 'warning',
            message: registry.warnings[0],
          });
        }
      })
      .catch((error) => {
        if (disposed) return;
        setAvailableSlashCommands([]);
        useToastStore.getState().addToast({
          type: 'error',
          message: error instanceof Error ? error.message : '加载 slash commands 失败',
        });
      });

    return () => {
      disposed = true;
    };
  }, [activeWorkspace.path]);

  const availableSlashCommandMap = useMemo(
    () => new Map(availableSlashCommands.map((command) => [command.name, command])),
    [availableSlashCommands],
  );

  const dockType = currentAsk ? 'ask' : 'none';
  const modelGroups = providers
    .map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      models: (provider.models ?? [])
        .filter((model) => model.enabled)
        .map((model) => ({
          id: model.id,
          name: model.name,
          note: model.note,
        })),
    }))
    .filter((group) => group.models.length > 0);

  const handleToggleFullAuto = () => {
    const nextFullAuto = !composerControls.fullAuto;
    const nextMode = nextFullAuto ? 'full_auto' : 'default';

    setComposerControls({ fullAuto: nextFullAuto });
    setPermissionConfig({ mode: nextMode });

    if (!nextFullAuto) return;

    const pendingPermissions = Array.from(usePermissionStore.getState().pendingPermissions.values());
    pendingPermissions.forEach((request) => {
      void approvePermission({ toolId: request.toolId, approved: true });
      usePermissionStore.getState().resolvePending(request.toolId, true);
      resolvePermissionRequestInTimeline(request.sessionId, request.toolId, true);
      updateSession(request.sessionId, {
        runtime: {
          state: 'streaming',
          message: '正在流式生成。',
          updatedAt: Date.now(),
        },
      });
    });
  };

  const {
    text,
    setText,
    attachments,
    handleAddAttachments,
    handleRemoveAttachment,
    selectedAskOptions,
    handleSend,
    handleCancelQueue,
    handleRemoveQueuedItem,
    handleInterrupt,
    handleAskOptionToggle,
    handleResetAskOptions,
    handleIgnoreAsk,
    slashState,
    activeSlashCommand,
    handleSlashNavigate,
    handleSlashConfirm,
    handleSlashClose,
    handleClearActiveSlashCommand,
  } = useComposerActions({
    activeSessionId,
    runtimeState,
    queueState,
    currentAsk: currentAsk || null,
    allTasksDone,
    composerMode: composerControls.agentId,
    availableSlashCommands: availableSlashCommandMap,
  });

  if (dockType === 'ask' && currentAsk) {
    return (
      <AskDock
        currentAsk={currentAsk}
        selectedAskOptions={selectedAskOptions}
        onOptionToggle={handleAskOptionToggle}
        onResetOptions={handleResetAskOptions}
        onSubmit={handleSend}
        onIgnore={handleIgnoreAsk}
      />
    );
  }

  const headerContent = (
    <>
      {hasTasks && (
        <TaskDock
          tasks={currentTasks!}
          isMinimized={isTaskMinimized}
          onToggleMinimize={toggleTaskMinimized}
        />
      )}
      {pendingItems.length > 0 && (
        <AppendDock
          items={pendingItems}
          onRemoveItem={handleRemoveQueuedItem}
          onCancelAll={handleCancelQueue}
          onInterrupt={handleInterrupt}
          queueState={queueState}
          isMinimized={isAppendMinimized}
          onToggleMinimize={toggleAppendMinimized}
        />
      )}
    </>
  );

  return (
    <MainComposer
      text={text}
      onTextChange={setText}
      attachments={attachments}
      onAddAttachments={handleAddAttachments}
      onRemoveAttachment={handleRemoveAttachment}
      onSend={handleSend}
      dockType={dockType}
      headerContent={headerContent}
      controls={composerControls}
      modelGroups={modelGroups}
      slashState={slashState}
      activeSlashCommand={activeSlashCommand}
      runtimeState={runtimeState}
      queueState={queueState}
      onSetAgentId={(agentId) => setComposerControls({ agentId })}
      onSetModel={(model) => setComposerControls(model)}
      onSetReasoning={(reasoning) => setComposerControls({ reasoning })}
      onToggleFullAuto={handleToggleFullAuto}
      onInterrupt={handleInterrupt}
      onSlashNavigate={handleSlashNavigate}
      onSlashConfirm={handleSlashConfirm}
      onSlashClose={handleSlashClose}
      onClearActiveSlashCommand={handleClearActiveSlashCommand}
    />
  );
};
