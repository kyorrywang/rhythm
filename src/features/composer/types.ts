import { SessionPhase, SelectionType, Task, QueuedMessage, AskQuestion } from '@/types/schema';

export type DockType = 'none' | 'append' | 'ask';

export const PHASE_TO_DOCK: Record<SessionPhase, DockType> = {
  idle: 'none',
  streaming: 'none',
  streaming_with_queue: 'append',
  processing_queue: 'append',
  waiting_for_ask: 'ask',
  interrupting: 'append',
};

export interface AskDockProps {
  currentAsk: { toolId: string; question: string; options: string[]; selectionType?: SelectionType; questions?: AskQuestion[] };
  text: string;
  setText: (v: string) => void;
  selectedAskOptions: string[];
  onOptionToggle: (opt: string) => void;
  onSubmit: () => void;
  onIgnore?: () => void;
}

export interface TaskDockProps {
  tasks: Task[];
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

export interface AppendDockProps {
  queuedMessages: QueuedMessage[];
  queueLength: number;
  onRemoveItem: (queuedId: string) => void;
  onCancelAll: () => void;
  onInterrupt: () => void;
  phase: SessionPhase;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

export interface MainComposerProps {
  text: string;
  onTextChange: (v: string) => void;
  onSend: () => void;
  dockType: DockType;
  headerContent?: React.ReactNode;
}
