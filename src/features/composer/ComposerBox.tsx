import { useSessionStore } from '@/store/useSessionStore';
import { PHASE_TO_DOCK } from './types';
import { useComposerActions } from './hooks/useComposerActions';
import { AskDock } from './components/AskDock';
import { MainComposer } from './components/MainComposer';
import { TaskDock } from './components/TaskDock';
import { AppendDock } from './components/AppendDock';

export const ComposerBox = () => {
  const { activeSessionId, sessions, toggleTaskMinimized, toggleAppendMinimized } = useSessionStore();
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;
  const currentAsk = activeSession?.currentAsk;
  const currentTasks = activeSession?.currentTasks;
  const phase = activeSession?.phase || 'idle';
  const queuedMessages = activeSession?.queuedMessages || [];
  const isTaskMinimized = activeSession?.taskDockMinimized ?? false;
  const isAppendMinimized = activeSession?.appendDockMinimized ?? false;
  const hasTasks = !!(currentTasks && currentTasks.length > 0);
  const allTasksDone: boolean = hasTasks && currentTasks!.every((t: { status: string }) => t.status === 'completed');

  const dockType = PHASE_TO_DOCK[phase as keyof typeof PHASE_TO_DOCK] || 'none';

  const {
    text,
    setText,
    selectedAskOptions,
    handleSend,
    handleCancelQueue,
    handleRemoveQueuedItem,
    handleInterrupt,
    handleAskOptionToggle,
    handleResetAskOptions,
    handleIgnoreAsk,
  } = useComposerActions({ activeSessionId, phase, currentAsk: currentAsk || null, allTasksDone });

  if (dockType === 'ask' && currentAsk) {
    return (
      <AskDock
        currentAsk={currentAsk}
        text={text}
        setText={setText}
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
      {dockType === 'append' && (
        <AppendDock
          queuedMessages={queuedMessages}
          queueLength={queuedMessages.length}
          onRemoveItem={handleRemoveQueuedItem}
          onCancelAll={handleCancelQueue}
          onInterrupt={handleInterrupt}
          phase={phase}
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
      onSend={handleSend}
      dockType={dockType}
      headerContent={headerContent}
    />
  );
};
