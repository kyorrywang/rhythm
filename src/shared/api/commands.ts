import { Channel } from '@tauri-apps/api/core';
import { client } from './client';
import { loadPersistedSessions } from '@/shared/lib/sessionPersistence';
import type {
  BackendSessionInfo,
  BackendSettings,
  BackendPluginSummary,
  BackendCronJobConfig,
  ChatStreamRequest,
  SubmitAnswerRequest,
  ApprovePermissionRequest,
  InterruptSessionRequest,
} from '@/shared/types/api';
import type { ServerEventChunk, Session } from '@/shared/types/schema';

export function chatStream(
  request: ChatStreamRequest,
  onEvent: Channel<ServerEventChunk>,
): Promise<void> {
  return client.invoke('chat_stream', { sessionId: request.sessionId, prompt: request.prompt, cwd: request.cwd, onEvent } as never);
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

function mapBackendSessionInfo(info: BackendSessionInfo): Session {
  const createdAt = Number(info.created_at || 0) * 1000 || Date.now();
  return {
    id: info.session_id,
    title: info.session_id,
    updatedAt: createdAt,
    messages: [],
    taskDockMinimized: false,
    appendDockMinimized: false,
    queuedMessages: [],
    phase: info.status === 'running' ? 'streaming' : 'idle',
  };
}

export async function getSessions(): Promise<Session[]> {
  const persisted = loadPersistedSessions();
  const runtimeSessions = await client.invoke('get_sessions', {} as never);
  const runtimeMapped = runtimeSessions.map(mapBackendSessionInfo);

  const merged = new Map<string, Session>();
  for (const session of persisted) {
    merged.set(session.id, {
      ...session,
      messages: session.messages || [],
      queuedMessages: session.queuedMessages || [],
      taskDockMinimized: session.taskDockMinimized ?? false,
      appendDockMinimized: session.appendDockMinimized ?? false,
    });
  }
  for (const session of runtimeMapped) {
    const existing = merged.get(session.id);
    merged.set(session.id, {
      ...session,
      ...existing,
      phase: session.phase,
      updatedAt: Math.max(existing?.updatedAt || 0, session.updatedAt),
    });
  }

  return Array.from(merged.values());
}

export async function createSession(title = 'New Session'): Promise<Session> {
  const now = Date.now();
  return {
    id: `session-${now}`,
    title,
    updatedAt: now,
    messages: [],
    taskDockMinimized: false,
    appendDockMinimized: false,
    queuedMessages: [],
    phase: 'idle',
  };
}
