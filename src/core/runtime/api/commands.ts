import { Channel } from '@tauri-apps/api/core';
import { client } from './client';
import { sanitizeMessage, sanitizeSession } from '@/core/sessions/sessionSanitizer';
import type {
  BackendSettings,
  BackendWorkspaceInfo,
  BackendWorkspaceDirList,
  BackendWorkspaceShellResult,
  BackendWorkspaceTextFile,
  BackendWorkspaceWriteResult,
  BackendPluginSummary,
  BackendPluginInstallPreview,
  BackendPluginRuntimeInfo,
  BackendCronJobConfig,
  ChatStreamRequest,
  AttachSessionStreamRequest,
  SubmitAnswerRequest,
  ApprovePermissionRequest,
  InterruptSessionRequest,
  LlmCompleteRequest,
  PluginCommandRequest,
  PluginCommandResponse,
  PluginCommandStartResponse,
  PluginCommandCancelRequest,
  PluginUninstallStoragePolicy,
  PluginStorageFileRequest,
  PluginStorageGetRequest,
  PluginStorageSetRequest,
  PluginStorageTextFileSetRequest,
  PluginCommandEvent,
  WorkspaceShellRunRequest,
} from '@/shared/types/api';
import type { Message, MessageSegment, ServerEventChunk, Session, StreamRuntimeState, ToolCall } from '@/shared/types/schema';

export function chatStream(
  request: ChatStreamRequest,
  onEvent: Channel<ServerEventChunk>,
): Promise<void> {
  return client.invoke('chat_stream', {
    sessionId: request.sessionId,
    prompt: request.prompt,
    attachments: request.attachments,
    cwd: request.cwd,
    profileId: request.profileId,
    permissionMode: request.permissionMode,
    allowedTools: request.allowedTools,
    disallowedTools: request.disallowedTools,
    providerId: request.providerId,
    model: request.model,
    reasoning: request.reasoning,
    onEvent,
  } as never);
}

export function submitUserAnswer(request: SubmitAnswerRequest): Promise<void> {
  return client.invoke('submit_user_answer', request);
}

export function attachSessionStream(
  request: AttachSessionStreamRequest,
  onEvent: Channel<ServerEventChunk>,
): Promise<boolean> {
  return client.invoke('attach_session_stream', {
    sessionId: request.sessionId,
    afterEventId: request.afterEventId,
    onEvent,
  } as never);
}

export function approvePermission(request: ApprovePermissionRequest): Promise<void> {
  return client.invoke('approve_permission', request as never);
}

export function interruptSession(request: InterruptSessionRequest): Promise<void> {
  return client.invoke('interrupt_session', request);
}

export function llmComplete(request: LlmCompleteRequest): Promise<string> {
  return client.invoke('llm_complete', {
    messages: request.messages,
    providerId: request.providerId,
    model: request.model,
    timeoutSecs: request.timeoutSecs,
  } as never);
}

export function getSettings(): Promise<BackendSettings> {
  return client.invoke('get_settings', {} as never);
}

export function saveSettings(settings: BackendSettings): Promise<void> {
  return client.invoke('save_settings', { settings } as never);
}

export function listPlugins(cwd: string): Promise<BackendPluginSummary[]> {
  return client.invoke('list_plugins', { cwd } as never);
}

export function enablePlugin(name: string): Promise<void> {
  return client.invoke('enable_plugin', { name } as never);
}

export function disablePlugin(name: string): Promise<void> {
  return client.invoke('disable_plugin', { name } as never);
}

export function installPlugin(sourcePath: string): Promise<BackendPluginSummary> {
  return client.invoke('install_plugin_cmd', { sourcePath } as never);
}

export function previewInstallPlugin(sourcePath: string): Promise<BackendPluginInstallPreview> {
  return client.invoke('preview_install_plugin_cmd', { sourcePath } as never);
}

export function uninstallPlugin(name: string, storagePolicy: PluginUninstallStoragePolicy = 'keep'): Promise<boolean> {
  return client.invoke('uninstall_plugin_cmd', { name, storagePolicy } as never);
}

export function grantPluginPermission(name: string, permission: string, cwd?: string): Promise<void> {
  return client.invoke('grant_plugin_permission', { name, permission, cwd } as never);
}

export function revokePluginPermission(name: string, permission: string, cwd?: string): Promise<void> {
  return client.invoke('revoke_plugin_permission', { name, permission, cwd } as never);
}

export function getPluginRuntimeInfo(cwd: string, pluginName: string): Promise<BackendPluginRuntimeInfo> {
  return client.invoke('plugin_runtime_info', { cwd, pluginName } as never);
}

export function invokePluginCommand(request: PluginCommandRequest): Promise<PluginCommandResponse> {
  return client.invoke('plugin_invoke_command', { request } as never);
}

export function startPluginCommand(
  request: PluginCommandRequest,
  onEvent: Channel<PluginCommandEvent>,
): Promise<PluginCommandStartResponse> {
  return client.invoke('plugin_start_command', { request, onEvent } as never);
}

export function cancelPluginCommand(request: PluginCommandCancelRequest): Promise<boolean> {
  return client.invoke('plugin_cancel_command', { request } as never);
}

export function getPluginStorageValue<T = unknown>(request: PluginStorageGetRequest): Promise<T | null> {
  return client.invoke('plugin_storage_get', { request } as never) as Promise<T | null>;
}

export function setPluginStorageValue(request: PluginStorageSetRequest): Promise<void> {
  return client.invoke('plugin_storage_set', { request } as never);
}

export function deletePluginStorageValue(request: PluginStorageGetRequest): Promise<void> {
  return client.invoke('plugin_storage_delete', { request } as never);
}

export function readPluginStorageTextFile(request: PluginStorageFileRequest): Promise<string | null> {
  return client.invoke('plugin_storage_read_text_file', { request } as never);
}

export function writePluginStorageTextFile(request: PluginStorageTextFileSetRequest): Promise<void> {
  return client.invoke('plugin_storage_write_text_file', { request } as never);
}

export function deletePluginStorageFile(request: PluginStorageFileRequest): Promise<void> {
  return client.invoke('plugin_storage_delete_file', { request } as never);
}

export function listPluginStorageFiles(request: PluginStorageFileRequest): Promise<string[]> {
  return client.invoke('plugin_storage_list_files', { request } as never);
}

export function listCronJobs(): Promise<BackendCronJobConfig[]> {
  return client.invoke('cron_list', {} as never);
}

export function getWorkspaceInfo(path: string): Promise<BackendWorkspaceInfo> {
  return client.invoke('workspace_info', { path } as never);
}

export function listWorkspaceDir(cwd: string, path: string): Promise<BackendWorkspaceDirList> {
  return client.invoke('workspace_list_dir', { cwd, path } as never);
}

export function readWorkspaceTextFile(cwd: string, path: string): Promise<BackendWorkspaceTextFile> {
  return client.invoke('workspace_read_text_file', { cwd, path } as never);
}

export function writeWorkspaceTextFile(cwd: string, path: string, content: string): Promise<BackendWorkspaceWriteResult> {
  return client.invoke('workspace_write_text_file', { cwd, path, content } as never);
}

export function runWorkspaceShell(request: WorkspaceShellRunRequest): Promise<BackendWorkspaceShellResult> {
  return client.invoke('workspace_shell_run', { request } as never);
}

export function listWorkspaceSessions(cwd: string): Promise<Session[]> {
  return client.invoke('list_workspace_sessions', { cwd } as never);
}

export function listRuntimeSessions(): Promise<import('@/shared/types/api').BackendSessionInfo[]> {
  return client.invoke('get_sessions', {} as never);
}

export function getWorkspaceSession(cwd: string, sessionId: string): Promise<Session | null> {
  return client.invoke('get_workspace_session', { cwd, sessionId } as never);
}

export function saveWorkspaceSession(cwd: string, session: Session): Promise<Session> {
  return client.invoke('save_workspace_session', { cwd, session } as never);
}

export function deleteWorkspaceSession(cwd: string, sessionId: string): Promise<boolean> {
  return client.invoke('delete_workspace_session', { cwd, sessionId } as never);
}

export async function getSessions(cwd: string): Promise<Session[]> {
  const [sessions, runtimeSessions] = await Promise.all([
    listWorkspaceSessions(cwd),
    listRuntimeSessions().catch(() => []),
  ]);
  return normalizeSessions(
    sessions,
    new Set(runtimeSessions.map((session) => session.session_id)),
  );
}

export async function createSession(title = 'New Session', workspacePath?: string): Promise<Session> {
  const now = Date.now();
  return {
    id: `session-${now}`,
    title,
    updatedAt: now,
    workspacePath,
    messages: [],
    taskDockMinimized: false,
    appendDockMinimized: false,
    queuedMessages: [],
    queueState: 'idle',
    runtime: {
      state: 'idle',
      updatedAt: now,
    },
  };
}

const volatileRuntimeStates: StreamRuntimeState[] = [
  'starting',
  'streaming',
  'backoff_waiting',
  'retrying',
  'interrupting',
] as const;

function getSessionFirstActivityTime(session: Session | undefined): number | undefined {
  if (!session) return undefined;
  const firstMessageTime = session.messages
    ?.map((message) => message.startedAt || message.createdAt)
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b)[0];
  return firstMessageTime || session.updatedAt || session.runtime?.updatedAt;
}

function resolveToolStartTime(
  tool: ToolCall,
  message: Message,
  session: Session,
  relatedSession?: Session,
): number {
  return (
    tool.startedAt
    || getSessionFirstActivityTime(relatedSession)
    || message.startedAt
    || message.createdAt
    || getSessionFirstActivityTime(session)
    || session.updatedAt
    || Date.now()
  );
}

function resolveToolEndTime(tool: ToolCall, referenceTime: number): number | undefined {
  return tool.endedAt || (tool.status === 'running' ? undefined : referenceTime);
}

function resolveMessageStartTime(message: Message, session: Session): number {
  return message.startedAt || message.createdAt || getSessionFirstActivityTime(session) || session.updatedAt || Date.now();
}

function resolveMessageEndTime(message: Message, referenceTime: number): number | undefined {
  return message.endedAt || (message.status === 'completed' ? referenceTime : undefined);
}

export function normalizeSessions(sessions: Session[], activeRuntimeSessionIds: Set<string> = new Set()): Session[] {
  const normalized = sessions.map((session) => normalizeSession(sanitizeSession(session), activeRuntimeSessionIds));
  const byId = new Map(normalized.map((session) => [session.id, session]));

  return normalized.map((session): Session => ({
    ...sanitizeSession(session),
    messages: (session.messages || []).map((message): Message => ({
      ...sanitizeMessage(message),
      segments: message.segments?.map((segment): MessageSegment => {
        if (segment.type !== 'tool') return segment;
        if (segment.tool.name !== 'spawn_subagent') return segment;
        if (!segment.tool.subSessionId) return segment;

        const childSession = byId.get(segment.tool.subSessionId);
        const childState = childSession?.runtime?.state;
        if (!childState || !['completed', 'failed', 'interrupted', 'idle'].includes(childState)) {
          return segment;
        }

        const referenceTime =
          childSession?.subagentResult?.endedAt
          || childSession?.runtime?.updatedAt
          || childSession?.updatedAt
          || session.updatedAt
          || Date.now();
        const startTime = resolveToolStartTime(segment.tool, message, session, childSession);
        const endTime = referenceTime;

        return {
          ...segment,
          tool: {
            ...segment.tool,
            status: childState === 'failed' ? 'error' : childState === 'completed' || childState === 'idle' ? 'completed' : 'interrupted',
            isPreparing: false,
            startedAt: startTime,
            endedAt: endTime,
          },
        };
      }),
    })),
  }));
}

function normalizeSession(session: Session, activeRuntimeSessionIds: Set<string>): Session {
  const runtime = session.runtime || {
    state: 'idle',
    updatedAt: session.updatedAt,
  };

  const shouldFinalizeVolatileState =
    !activeRuntimeSessionIds.has(session.id) && (
      volatileRuntimeStates.includes(runtime.state)
    );

  const normalizedRuntime = shouldFinalizeVolatileState
    ? {
        ...runtime,
        state: 'interrupted' as const,
        reason: 'interrupt' as const,
        message: runtime.message || '会话已停止。',
        updatedAt: runtime.updatedAt || session.updatedAt,
      }
    : runtime;

  const referenceTime = Math.max(normalizedRuntime.updatedAt || 0, session.updatedAt || 0, 0) || Date.now();
  const finalizedToolStatus: ToolCall['status'] | null =
    normalizedRuntime.state === 'failed'
      ? 'error'
      : normalizedRuntime.state === 'completed' || normalizedRuntime.state === 'idle'
        ? 'completed'
        : normalizedRuntime.state === 'interrupted'
          ? 'interrupted'
          : null;
  const dropRetrySegments =
    normalizedRuntime.state === 'completed'
    || normalizedRuntime.state === 'failed'
    || normalizedRuntime.state === 'interrupted'
    || normalizedRuntime.state === 'idle';

  return {
    ...sanitizeSession(session),
    messages: (session.messages || []).map((message): Message => {
      const messageStartedAt = resolveMessageStartTime(message, session);
      const messageEndedAt = resolveMessageEndTime(message, referenceTime);
      const segments: MessageSegment[] = (message.segments || [])
        .filter((segment) => !(dropRetrySegments && segment.type === 'retry'))
        .map((segment): MessageSegment => {
          if (segment.type === 'thinking' && segment.isLive) {
            const startedAt = segment.startedAt || messageStartedAt;
            const endedAt = messageEndedAt || referenceTime;
            return {
              ...segment,
              isLive: false,
              startedAt,
              endedAt,
            };
          }

          if (segment.type === 'tool' && segment.tool.status === 'running' && finalizedToolStatus) {
            const startTime = resolveToolStartTime(segment.tool, message, session);
            const endTime = resolveToolEndTime(segment.tool, referenceTime) || referenceTime;
            return {
              ...segment,
              tool: {
                ...segment.tool,
                status: finalizedToolStatus,
                isPreparing: false,
                startedAt: startTime,
                endedAt: endTime,
              },
            };
          }

          if (segment.type === 'thinking') {
            const startedAt = segment.startedAt || messageStartedAt;
            const endedAt = segment.endedAt;
            return {
              ...segment,
              startedAt,
              endedAt,
            };
          }

          if (segment.type === 'ask' || segment.type === 'permission') {
            const startedAt = segment.startedAt || messageStartedAt;
            const endedAt = segment.endedAt;
            return {
              ...segment,
              startedAt,
              endedAt,
            };
          }

          return segment;
        });

      const shouldFinalizeMessage =
        message.status === 'running'
        || message.role === 'assistant'
        || segments.some((segment) => segment.type === 'thinking' || segment.type === 'tool');

      return {
        ...sanitizeMessage(message),
        segments,
        startedAt: messageStartedAt,
        endedAt: messageEndedAt,
        status: shouldFinalizeMessage && dropRetrySegments ? 'completed' : message.status,
      };
    }),
    queuedMessages: session.queuedMessages || [],
    taskDockMinimized: session.taskDockMinimized ?? false,
    appendDockMinimized: session.appendDockMinimized ?? false,
    queueState:
      session.queueState === 'streaming_with_queue' || session.queueState === 'processing_queue' || session.queueState === 'interrupting'
        ? session.queueState
        : 'idle',
    runtime: normalizedRuntime,
  };
}
