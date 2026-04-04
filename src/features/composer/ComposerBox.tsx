import { useSessionStore } from '@/store/useSessionStore';
import { PHASE_TO_DOCK } from './types';
import { useComposerActions } from './hooks/useComposerActions';
import { AskDock } from './components/AskDock';
import { MainComposer } from './components/MainComposer';
import { TaskDock } from './components/TaskDock';
import { AppendDock } from './components/AppendDock';

export const ComposerBox = () => {
  const { activeSessionId, sessions, isTaskMinimized, isAppendMinimized, toggleTaskMinimized, toggleAppendMinimized } = useSessionStore();
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const currentAsk = activeSession?.currentAsk;
  const currentTasks = activeSession?.currentTasks;
  const phase = activeSession?.phase || 'idle';
  const queuedMessages = activeSession?.queuedMessages || [];
  const hasTasks = !!(currentTasks && currentTasks.length > 0);
  const allTasksDone: boolean = hasTasks && currentTasks!.every(t => t.status === 'completed');

  const dockType = PHASE_TO_DOCK[phase] || 'none';

  const {
    text,
    setText,
    selectedAskOptions,
    handleSend,
    handleCancelQueue,
    handleRemoveQueuedItem,
    handleInterrupt,
    handleAskOptionToggle,
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
