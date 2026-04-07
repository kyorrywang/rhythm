import { SessionPhase, SelectionType, Task, QueuedMessage, AskQuestion, MessageMode, Attachment } from '@/shared/types/schema';

export type DockType = 'none' | 'append' | 'ask';

export const PHASE_TO_DOCK: Record<SessionPhase, DockType> = {
  idle: 'none',
  streaming: 'none',
  streaming_with_queue: 'append',
  processing_queue: 'append',
  waiting_for_ask: 'ask',
  interrupting: 'none',
  waiting_for_permission: 'append',
};

export interface AskDockProps {
  currentAsk: { toolId: string; title: string; question: string; options: string[]; selectionType: SelectionType; questions?: AskQuestion[] };
  text: string;
  setText: (v: string) => void;
  selectedAskOptions: string[];
  onOptionToggle: (opt: string) => void;
  onResetOptions: () => void;
  onSubmit: (submission?: { answer: string; record: { selected: string[]; text: string } }) => void;
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
  attachments: Attachment[];
  onAddAttachments: (attachments: Attachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  dockType: DockType;
  headerContent?: React.ReactNode;
  controls: {
    mode: MessageMode;
    providerId: string;
    modelId: string;
    modelName: string;
    reasoning: 'low' | 'medium' | 'high';
    fullAuto: boolean;
  };
  modelGroups: ComposerModelGroup[];
  sessionPhase?: SessionPhase;
  onSetMode: (mode: MainComposerProps['controls']['mode']) => void;
  onSetModel: (model: ComposerModelSelection) => void;
  onSetReasoning: (reasoning: MainComposerProps['controls']['reasoning']) => void;
  onToggleFullAuto: () => void;
  onInterrupt: () => void;
}

export interface ComposerModelSelection {
  providerId: string;
  modelId: string;
  modelName: string;
}

export interface ComposerModelGroup {
  providerId: string;
  providerName: string;
  models: Array<{
    id: string;
    name: string;
    note?: string;
    isDefault?: boolean;
  }>;
}
