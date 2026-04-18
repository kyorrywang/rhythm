import type { BackendSlashCommand } from '@/shared/types/api';
import type { Attachment, AskQuestion, AskRequest, AskResponse, QueuedMessage, SelectionType, SessionQueueState, StreamRuntime, StreamRuntimeState, Task } from '@/shared/types/schema';
import type { PermissionRequest } from '@/features/permissions/store/usePermissionStore';

export type DockType = 'none' | 'append' | 'ask';

export interface AskDockProps {
  currentAsk: { toolId: string; title: string; question: string; options: string[]; selectionType: SelectionType; questions?: AskQuestion[] };
  text: string;
  setText: (v: string) => void;
  selectedAskOptions: string[];
  onOptionToggle: (opt: string) => void;
  onResetOptions: () => void;
  onSubmit: (submission?: { answer: string; record: AskResponse }) => void;
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
  queueState: SessionQueueState;
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
    agentId: string;
    providerId: string;
    modelId: string;
    modelName: string;
    reasoning: 'low' | 'medium' | 'high';
    fullAuto: boolean;
  };
  modelGroups: ComposerModelGroup[];
  slashState?: ComposerSlashState;
  runtimeState?: StreamRuntimeState;
  queueState?: SessionQueueState;
  onSetAgentId: (agentId: string) => void;
  onSetModel: (model: ComposerModelSelection) => void;
  onSetReasoning: (reasoning: MainComposerProps['controls']['reasoning']) => void;
  onToggleFullAuto: () => void;
  onInterrupt: () => void;
  onSlashNavigate?: (direction: 'up' | 'down') => void;
  onSlashConfirm?: () => void;
  onSlashSelect?: (command: ComposerSlashCommand) => void;
  onSlashClose?: () => void;
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
  }>;
}

export interface ComposerSlashCommand extends BackendSlashCommand {
  rawQuery: string;
}

export interface ComposerSlashState {
  active: boolean;
  query: string;
  commands: ComposerSlashCommand[];
  selectedIndex: number;
}

