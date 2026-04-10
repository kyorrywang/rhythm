import type { PendingItem } from '@/features/composer/types';
import type { Session } from '@/shared/types/schema';
import type { PermissionRequest } from '@/shared/state/usePermissionStore';

export function derivePendingItems(
  session: Session | undefined,
  permissionRequests: PermissionRequest[],
): PendingItem[] {
  if (!session) return [];

  const items: PendingItem[] = [];

  if (session.runtime && (session.runtime.state === 'backoff_waiting' || session.runtime.state === 'retrying')) {
    items.push({
      id: `${session.id}:runtime:${session.runtime.state}`,
      kind: 'retry_backoff',
      priority: 100,
      title: session.runtime.state === 'retrying' ? '正在重试' : '等待自动重试',
      description: session.runtime.message || '当前请求正在自动重试。',
      createdAt: session.runtime.updatedAt,
      runtime: session.runtime,
    });
  }

  permissionRequests
    .filter((request) => request.sessionId === session.id)
    .forEach((request) => {
      items.push({
        id: `${session.id}:permission:${request.toolId}`,
        kind: 'permission_request',
        priority: 90,
        title: `等待权限: ${request.toolName}`,
        description: request.reason,
        createdAt: request.timestamp,
        request,
      });
    });

  if (session.currentAsk) {
    items.push({
      id: `${session.id}:ask:${session.currentAsk.toolId}`,
      kind: 'ask_request',
      priority: 80,
      title: session.currentAsk.title || '等待回答',
      description: session.currentAsk.question,
      createdAt: session.updatedAt,
      ask: session.currentAsk,
    });
  }

  (session.queuedMessages || []).forEach((queuedMessage) => {
    items.push({
      id: `${session.id}:queued:${queuedMessage.id}`,
      kind: 'queued_message',
      priority: queuedMessage.priority === 'urgent' ? 70 : 60,
      title: queuedMessage.priority === 'urgent' ? '插队消息' : '排队消息',
      description: queuedMessage.message.content || '空消息',
      createdAt: queuedMessage.createdAt,
      queuedMessage,
    });
  });

  return items.sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.createdAt - right.createdAt;
  });
}
