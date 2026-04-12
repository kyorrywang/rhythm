import { create } from 'zustand';
import type {
  ActivityBarContribution,
  CommandRegistrationMetadata,
  LeftPanelContribution,
  MessageActionContribution,
  OverlayContribution,
  PluginRuntimeRecord,
  PluginRuntimeStatus,
  PluginTaskRecord,
  SettingsSectionContribution,
  TaskUpdateInput,
  ToolResultActionContribution,
  WorkbenchContribution,
} from './types';

type CommandHandler = (input: unknown) => Promise<unknown> | unknown;
type EventHandler = (payload: unknown) => void;

interface CommandRegistration {
  pluginId: string;
  handler: CommandHandler;
  metadata?: CommandRegistrationMetadata;
}

interface PluginHostState {
  activityBarItems: ActivityBarContribution[];
  leftPanels: Record<string, LeftPanelContribution>;
  workbenchViews: Record<string, WorkbenchContribution>;
  overlayViews: Record<string, OverlayContribution>;
  settingsSections: Record<string, SettingsSectionContribution>;
  commandHandlers: Record<string, CommandRegistration>;
  messageActions: MessageActionContribution[];
  toolResultActions: ToolResultActionContribution[];
  eventHandlers: Record<string, Array<{ pluginId: string; handler: EventHandler }>>;
  commandInvocations: PluginRuntimeEvent[];
  eventLog: PluginRuntimeEvent[];
  tasks: Record<string, PluginTaskRecord>;
  runtime: Record<string, PluginRuntimeRecord>;
  resetPluginHost: () => void;
  setPluginRuntime: (pluginId: string, updates: Omit<Partial<PluginRuntimeRecord>, 'pluginId'>) => void;
  reportPluginError: (pluginId: string, error: unknown) => void;
  registerActivityBar: (pluginId: string, item: ActivityBarContribution) => () => void;
  registerLeftPanel: (pluginId: string, view: LeftPanelContribution) => () => void;
  registerWorkbench: (pluginId: string, view: WorkbenchContribution) => () => void;
  registerOverlay: (pluginId: string, view: OverlayContribution) => () => void;
  registerSettingsSection: (pluginId: string, section: SettingsSectionContribution) => () => void;
  registerCommand: (pluginId: string, id: string, handler: CommandHandler, metadata?: CommandRegistrationMetadata) => () => void;
  registerMessageAction: (pluginId: string, action: MessageActionContribution) => () => void;
  registerToolResultAction: (pluginId: string, action: ToolResultActionContribution) => () => void;
  registerEventHandler: (pluginId: string, event: string, handler: EventHandler) => () => void;
  emitPluginEvent: (event: string, payload: unknown) => void;
  recordCommandInvocation: (event: PluginRuntimeEvent) => void;
  startTask: (pluginId: string, title: string, detail?: string, id?: string) => PluginTaskRecord;
  updateTask: (pluginId: string, taskId: string, input: TaskUpdateInput) => void;
}

export interface PluginRuntimeEvent {
  id: string;
  pluginId: string;
  type: 'command' | 'event';
  name: string;
  status?: 'started' | 'completed' | 'error';
  message?: string;
  createdAt: number;
}

export const usePluginHostStore = create<PluginHostState>((set) => ({
  activityBarItems: [],
  leftPanels: {},
  workbenchViews: {},
  overlayViews: {},
  settingsSections: {},
  commandHandlers: {},
  messageActions: [],
  toolResultActions: [],
  eventHandlers: {},
  commandInvocations: [],
  eventLog: [],
  tasks: {},
  runtime: {},

  resetPluginHost: () =>
    set({
      activityBarItems: [],
      leftPanels: {},
      workbenchViews: {},
      overlayViews: {},
      settingsSections: {},
      commandHandlers: {},
      messageActions: [],
      toolResultActions: [],
      eventHandlers: {},
      commandInvocations: [],
      eventLog: [],
      tasks: {},
      runtime: {},
    }),

  setPluginRuntime: (pluginId, updates) =>
    set((state) => {
      const merged = Object.assign({}, state.runtime[pluginId], updates) as Partial<PluginRuntimeRecord>;
      return {
        runtime: {
          ...state.runtime,
          [pluginId]: {
            pluginId,
            status: merged.status ?? ('pending' as PluginRuntimeStatus),
            source: merged.source ?? 'manifest',
            entry: merged.entry,
            error: merged.error,
            activatedAt: merged.activatedAt,
          },
        },
      };
    }),

  reportPluginError: (pluginId, error) =>
    set((state) => {
      const current = state.runtime[pluginId];
      return {
        runtime: {
          ...state.runtime,
          [pluginId]: {
            pluginId,
            status: 'runtime_error',
            source: current?.source ?? 'manifest',
            entry: current?.entry,
            activatedAt: current?.activatedAt,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      };
    }),

  registerActivityBar: (pluginId, item) => {
    const nextItem = { ...item, pluginId };
    set((state) => ({
      activityBarItems: [
        ...state.activityBarItems.filter((entry) => entry.id !== nextItem.id),
        nextItem,
      ],
    }));
    return () =>
      set((state) => ({
        activityBarItems: state.activityBarItems.filter((entry) => entry.id !== nextItem.id),
      }));
  },

  registerLeftPanel: (pluginId, view) => {
    const nextView = { ...view, pluginId };
    set((state) => ({
      leftPanels: {
        ...state.leftPanels,
        [nextView.id]: nextView,
      },
    }));
    return () =>
      set((state) => {
        const { [nextView.id]: _removed, ...leftPanels } = state.leftPanels;
        return { leftPanels };
      });
  },

  registerWorkbench: (pluginId, view) => {
    const nextView = { ...view, pluginId };
    set((state) => ({
      workbenchViews: {
        ...state.workbenchViews,
        [nextView.id]: nextView,
      },
    }));
    return () =>
      set((state) => {
        const { [nextView.id]: _removed, ...workbenchViews } = state.workbenchViews;
        return { workbenchViews };
      });
  },

  registerOverlay: (pluginId, view) => {
    const nextView = { ...view, pluginId };
    set((state) => ({
      overlayViews: {
        ...state.overlayViews,
        [nextView.id]: nextView,
      },
    }));
    return () =>
      set((state) => {
        const { [nextView.id]: _removed, ...overlayViews } = state.overlayViews;
        return { overlayViews };
      });
  },

  registerSettingsSection: (pluginId, section) => {
    const nextSection = { ...section, pluginId };
    set((state) => ({
      settingsSections: {
        ...state.settingsSections,
        [nextSection.id]: nextSection,
      },
    }));
    return () =>
      set((state) => {
        const { [nextSection.id]: _removed, ...settingsSections } = state.settingsSections;
        return { settingsSections };
      });
  },

  registerCommand: (pluginId, id, handler, metadata) => {
    set((state) => ({
      commandHandlers: {
        ...state.commandHandlers,
        [id]: { pluginId, handler, metadata },
      },
    }));
    return () =>
      set((state) => {
        const { [id]: _removed, ...commandHandlers } = state.commandHandlers;
        return { commandHandlers };
      });
  },

  registerMessageAction: (pluginId, action) => {
    const nextAction = { ...action, pluginId };
    set((state) => ({
      messageActions: [
        ...state.messageActions.filter((entry) => entry.id !== nextAction.id),
        nextAction,
      ],
    }));
    return () =>
      set((state) => ({
        messageActions: state.messageActions.filter((entry) => entry.id !== nextAction.id),
      }));
  },

  registerToolResultAction: (pluginId, action) => {
    const nextAction = { ...action, pluginId };
    set((state) => ({
      toolResultActions: [
        ...state.toolResultActions.filter((entry) => entry.id !== nextAction.id),
        nextAction,
      ],
    }));
    return () =>
      set((state) => ({
        toolResultActions: state.toolResultActions.filter((entry) => entry.id !== nextAction.id),
      }));
  },

  registerEventHandler: (pluginId, event, handler) => {
    const entry = { pluginId, handler };
    set((state) => ({
      eventHandlers: {
        ...state.eventHandlers,
        [event]: [...(state.eventHandlers[event] || []), entry],
      },
    }));
    return () =>
      set((state) => ({
        eventHandlers: {
          ...state.eventHandlers,
          [event]: (state.eventHandlers[event] || []).filter((candidate) => candidate !== entry),
        },
      }));
  },

  emitPluginEvent: (event, payload) => {
    const runtimeEvent: PluginRuntimeEvent = {
      id: createRuntimeEventId(),
      pluginId: 'host',
      type: 'event',
      name: event,
      message: summarizePayload(payload),
      createdAt: Date.now(),
    };
    set((state) => ({
      eventLog: [runtimeEvent, ...state.eventLog].slice(0, 80),
    }));
    const handlers = usePluginHostStore.getState().eventHandlers[event] || [];
    for (const { pluginId, handler } of handlers) {
      try {
        handler(payload);
      } catch (error) {
        usePluginHostStore.getState().reportPluginError(pluginId, error);
      }
    }
  },

  recordCommandInvocation: (event) =>
    set((state) => ({
      commandInvocations: [event, ...state.commandInvocations].slice(0, 80),
    })),

  startTask: (pluginId, title, detail, id) => {
    const now = Date.now();
    const task: PluginTaskRecord = {
      id: id || `${pluginId}.task.${now}.${Math.random().toString(36).slice(2, 8)}`,
      pluginId,
      title,
      detail,
      status: 'running',
      startedAt: now,
      updatedAt: now,
    };
    set((state) => ({
      tasks: {
        ...state.tasks,
        [task.id]: task,
      },
    }));
    return task;
  },

  updateTask: (pluginId, taskId, input) =>
    set((state) => {
      const current = state.tasks[taskId];
      if (!current || current.pluginId !== pluginId) return {};
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...current,
            ...input,
            updatedAt: Date.now(),
          },
        },
      };
    }),
}));

function createRuntimeEventId() {
  return `plugin-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizePayload(payload: unknown) {
  if (payload === undefined) return undefined;
  if (typeof payload === 'string') return payload.slice(0, 240);
  try {
    return JSON.stringify(payload).slice(0, 240);
  } catch {
    return String(payload).slice(0, 240);
  }
}
