import { Channel } from '@tauri-apps/api/core';
import { client } from './client';
import type {
  BackendSettings,
  BackendWorkspaceInfo,
  BackendPluginSummary,
  BackendCronJobConfig,
  ChatStreamRequest,
  SubmitAnswerRequest,
  ApprovePermissionRequest,
  InterruptSessionRequest,
  LlmCompleteRequest,
} from '@/shared/types/api';
import type { ServerEventChunk, Session } from '@/shared/types/schema';

export function chatStream(
  request: ChatStreamRequest,
  onEvent: Channel<ServerEventChunk>,
): Promise<void> {
  return client.invoke('chat_stream', {
    sessionId: request.sessionId,
    prompt: request.prompt,
    attachments: request.attachments,
    cwd: request.cwd,
    permissionMode: request.permissionMode,
    providerId: request.providerId,
    model: request.model,
    reasoning: request.reasoning,
    mode: request.mode,
    onEvent,
  } as never);
}

export function submitUserAnswer(request: SubmitAnswerRequest): Promise<void> {
  return client.invoke('submit_user_answer', request);
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

export function listCronJobs(): Promise<BackendCronJobConfig[]> {
  return client.invoke('cron_list', {} as never);
}

export function getWorkspaceInfo(path: string): Promise<BackendWorkspaceInfo> {
  return client.invoke('workspace_info', { path } as never);
}

export function listWorkspaceSessions(cwd: string): Promise<Session[]> {
  return client.invoke('list_workspace_sessions', { cwd } as never);
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
  const sessions = await listWorkspaceSessions(cwd);
  return sessions.map(normalizeSession);
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
    phase: 'idle',
  };
}

function normalizeSession(session: Session): Session {
  return {
    ...session,
    messages: session.messages || [],
    queuedMessages: session.queuedMessages || [],
    taskDockMinimized: session.taskDockMinimized ?? false,
    appendDockMinimized: session.appendDockMinimized ?? false,
    phase: session.phase === 'streaming' ? 'idle' : session.phase,
  };
}
