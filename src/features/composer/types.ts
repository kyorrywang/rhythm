import { SessionPhase, SelectionType, Task, QueuedMessage, AskQuestion, MessageMode, Attachment, StreamRuntime, AskRequest } from '@/shared/types/schema';
import type { PermissionRequest } from '@/shared/state/usePermissionStore';

export type DockType = 'none' | 'append' | 'ask';

export const PHASE_TO_DOCK: Record<SessionPhase, DockType> = {
  idle: 'none',
  starting: 'none',
  streaming: 'none',
  retrying: 'none',
  streaming_with_queue: 'append',
  processing_queue: 'append',
  waiting_for_ask: 'ask',
  interrupting: 'none',
  waiting_for_permission: 'none',
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
  items: PendingItem[];
  onRemoveItem: (queuedId: string) => void;
  onCancelAll: () => void;
  onInterrupt: () => void;
  phase: SessionPhase;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

export type PendingItem =
  | {
    id: string;
    kind: 'queued_message';
    priority: number;
    title: string;
    description: string;
    createdAt: number;
    queuedMessage: QueuedMessage;
  }
  | {
    id: string;
    kind: 'retry_backoff';
    priority: number;
    title: string;
    description: string;
    createdAt: number;
    runtime: StreamRuntime;
  }
  | {
    id: string;
    kind: 'permission_request';
    priority: number;
    title: string;
    description: string;
    createdAt: number;
    request: PermissionRequest;
  }
  | {
    id: string;
    kind: 'ask_request';
    priority: number;
    title: string;
    description: string;
    createdAt: number;
    ask: AskRequest;
  };

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
