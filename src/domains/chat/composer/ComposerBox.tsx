import { useSessionStore } from '@/core/sessions/useSessionStore';
import { usePermissionStore } from '@/core/permissions/usePermissionStore';
import { approvePermission } from '@/core/runtime/api/commands';
import { useSettingsStore } from '@/core/runtime/useSettingsStore';
import { useComposerActions } from './hooks/useComposerActions';
import { derivePendingItems } from './lib/derivePendingItems';
import { AskDock } from './components/AskDock';
import { MainComposer } from './components/MainComposer';
import { TaskDock } from './components/TaskDock';
import { AppendDock } from './components/AppendDock';
import { getCurrentAsk, getCurrentTasks, getSessionQueueState, getSessionRuntimeState } from '@/core/sessions/sessionState';

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
  } = useComposerActions({
    activeSessionId,
    runtimeState,
    queueState,
    currentAsk: currentAsk || null,
    allTasksDone,
    composerMode: composerControls.agentId,
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
      runtimeState={runtimeState}
      queueState={queueState}
      onSetAgentId={(agentId) => setComposerControls({ agentId })}
      onSetModel={(model) => setComposerControls(model)}
      onSetReasoning={(reasoning) => setComposerControls({ reasoning })}
      onToggleFullAuto={handleToggleFullAuto}
      onInterrupt={handleInterrupt}
    />
  );
};
