import type { PendingItem } from '@/features/chat/model/types';
import type { Session } from '@/shared/types/schema';
import type { PermissionRequest } from '@/features/permissions/store/usePermissionStore';
import { getCurrentAsk, getMessageTextContent, getSessionQueueState } from '@/features/chat/utils/sessionState';

export function derivePendingItems(
  session: Session | undefined,
  permissionRequests: PermissionRequest[],
): PendingItem[] {
  if (!session) return [];

  const items: PendingItem[] = [];
  const queueState = getSessionQueueState(session);

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

  const currentAsk = getCurrentAsk(session);
  if (currentAsk) {
    items.push({
      id: `${session.id}:ask:${currentAsk.toolId}`,
      kind: 'ask_request',
      priority: 80,
      title: currentAsk.title || '等待回答',
      description: currentAsk.question,
      createdAt: session.updatedAt,
      ask: currentAsk,
    });
  }

  (session.queuedMessages || []).forEach((queuedMessage) => {
    items.push({
      id: `${session.id}:queued:${queuedMessage.id}`,
      kind: 'queued_message',
      priority: queuedMessage.priority === 'urgent' ? 70 : 60,
      title: queuedMessage.priority === 'urgent' ? '插队消息' : '排队消息',
      description: getMessageTextContent(queuedMessage.message) || '空消息',
      createdAt: queuedMessage.createdAt,
      queuedMessage,
    });
  });

  if (queueState === 'processing_queue' || queueState === 'interrupting') {
    items.push({
      id: `${session.id}:queue:${queueState}`,
      kind: 'retry_backoff',
      priority: 95,
      title: queueState === 'interrupting' ? '正在中断队列' : '正在消费队列',
      description: queueState === 'interrupting' ? '系统正在尝试停止当前运行。' : '上一条运行结束后，系统正在继续处理排队消息。',
      createdAt: session.updatedAt,
      runtime: session.runtime || { state: 'idle', updatedAt: session.updatedAt },
    });
  }

  return items.sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.createdAt - right.createdAt;
  });
}

