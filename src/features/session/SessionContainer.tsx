import { useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Archive, Pencil, Copy, ChevronRight, ArrowDown } from 'lucide-react';
import { ComposerBox } from '@/features/composer/ComposerBox';
import { UserMessage } from './components/UserMessage';
import { AgentMessage } from './components/AgentMessage';
import { SystemMessage } from './components/SystemMessage';
import { ContextUsagePanel } from './components/ContextUsagePanel';
import { ErrorBanner } from './components/ErrorBanner';
import { useSessionStore, useActiveSession } from '@/shared/state/useSessionStore';
import { useAutoScroll } from '@/shared/hooks/useAutoScroll';
import { themeRecipes } from '@/shared/theme/recipes';
import { EmptyState } from './EmptyState';
import type { Message, Session } from '@/shared/types/schema';
import { Button, MenuContent, MenuItem, MenuPortal, MenuRoot, MenuTrigger } from '@/shared/ui';
import { getMessageTextContent } from '@/shared/lib/sessionState';

export const SessionContainer = () => {
  const activeSession = useActiveSession();
  const sessions = useSessionStore((s) => s.sessions);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const archiveSession = useSessionStore((s) => s.archiveSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const messages = activeSession?.messages ?? [];
  const autoScrollKey = useMemo(
    () => buildContentVersion(activeSession),
    [activeSession],
  );
  const { scrollRef, contentRef, isUserAtBottom, scrollToBottom } = useAutoScroll(autoScrollKey);
  const runtimeState = activeSession?.runtime?.state;
  const isSessionRunning = Boolean(
    runtimeState
    && !['idle', 'completed', 'failed', 'interrupted', 'waiting_for_permission', 'waiting_for_user'].includes(runtimeState),
  );
  const showErrorBanner = activeSession?.runtime?.state === 'failed' && activeSession?.error;

  const isEmpty = !activeSession || messages.length === 0;
  const sessionBreadcrumbs = useMemo(
    () => collectSessionBreadcrumbs(activeSession, sessions),
    [activeSession, sessions],
  );

  return (
    <div className="relative flex min-w-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,var(--theme-shell-bg)_0%,var(--theme-workbench-bg-start)_24%,var(--theme-surface)_100%)]">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {isEmpty ? (
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
          <EmptyState />
        </div>
      ) : (
        <>
          <div className="shrink-0 px-6">
            <SessionHeader
              activeSession={activeSession}
              breadcrumbs={sessionBreadcrumbs}
              onSelectSession={setActiveSession}
              onOpenContextPanel={() => setIsContextPanelOpen(true)}
              archiveSession={archiveSession}
              renameSession={renameSession}
            />
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
            <div ref={contentRef} className="max-w-[820px] w-full mx-auto relative pointer-events-auto z-10 px-6">
            {showErrorBanner && (
              <div className="mb-4">
                <ErrorBanner message={activeSession.error || ''} onDismiss={() => useSessionStore.getState().updateSession(activeSession.id, { error: null })} />
              </div>
            )}

            <div className="relative space-y-[calc(var(--theme-section-gap)*1.15)] pb-12 text-[length:var(--theme-body-size)] leading-relaxed text-[var(--theme-text-primary)]">
              {messages.map((msg: Message, index: number) => (
                msg.role === 'user' ? (
                  <UserMessage key={msg.id || index} sessionId={activeSession.id} message={msg} />
                ) : msg.role === 'system' ? (
                  <SystemMessage key={msg.id || index} message={msg} />
                ) : (
                  <AgentMessage
                    key={msg.id || index}
                    message={msg}
                    sessionId={activeSession.id}
                    isLast={index === messages.length - 1}
                    isSessionRunning={isSessionRunning}
                  />
                )
              ))}
            </div>
          </div>
        </div>
        {!isUserAtBottom && (
          <div className="pointer-events-none absolute bottom-[112px] right-8 z-20">
            <Button
              variant="unstyled"
              size="none"
              onClick={scrollToBottom}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[color:color-mix(in_srgb,var(--theme-surface)_92%,transparent)] text-[var(--theme-text-secondary)] shadow-[var(--theme-shadow-strong)] backdrop-blur-md transition-colors hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]"
              title="滚到最下面"
            >
              <ArrowDown size={18} />
            </Button>
          </div>
        )}
        </>
      )}

      <div className="shrink-0 bg-gradient-to-t from-[var(--theme-surface)] via-[color:color-mix(in_srgb,var(--theme-surface)_95%,transparent)] to-transparent pt-4 pb-1 pointer-events-none z-30">
        <ComposerBox />
      </div>

      {activeSession && !isEmpty && (
        <ContextUsagePanel
          session={activeSession}
          isOpen={isContextPanelOpen}
          onClose={() => setIsContextPanelOpen(false)}
        />
      )}

      </div>
    </div>
  );
};

const SessionHeader = ({
  activeSession,
  breadcrumbs,
  onSelectSession,
  onOpenContextPanel,
  archiveSession,
  renameSession,
}: {
  activeSession?: Session;
  breadcrumbs: Session[];
  onSelectSession: (sessionId: string | null) => void;
  onOpenContextPanel: () => void;
  archiveSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[820px] items-center justify-between py-[var(--theme-section-gap)]">
      <div className="flex min-w-0 items-center gap-[var(--theme-toolbar-gap)]">
        <div className="flex min-w-0 items-center gap-1.5 text-[length:var(--theme-body-size)]">
          {breadcrumbs.map((session) => (
            <BreadcrumbLink
              key={session.id}
              title={session.title}
              onClick={() => onSelectSession(session.id)}
            />
          ))}
          <h2 className={`min-w-0 truncate ${themeRecipes.title()}`}>{activeSession?.title || '新会话'}</h2>
        </div>
      </div>
      <div className={themeRecipes.toolbar()}>
        <Button
          variant="unstyled"
          size="none"
          className="relative flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] focus:outline-none"
          title="上下文用量"
          onClick={onOpenContextPanel}
        >
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <path className="text-[var(--theme-border)]" strokeWidth="6" stroke="currentColor" fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path className="text-[var(--theme-text-muted)] transition-colors hover:text-[var(--theme-text-secondary)]" strokeWidth="6" strokeDasharray="6, 100" stroke="currentColor" fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
        </Button>
        <MenuRoot
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) {
              triggerRef.current?.blur();
            }
          }}
        >
          <MenuTrigger asChild>
            <Button
              ref={triggerRef}
              variant="unstyled"
              size="none"
              className="rounded-[var(--theme-radius-control)] p-1 text-[var(--theme-text-muted)] transition-colors hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-secondary)] focus:outline-none focus:ring-0 data-[state=open]:bg-[var(--theme-surface-muted)] data-[state=open]:text-[var(--theme-text-secondary)]"
            >
              <MoreHorizontal size={18} />
            </Button>
          </MenuTrigger>
          {activeSession && (
            <MenuPortal>
            <MenuContent
              align="end"
              sideOffset={8}
              collisionPadding={16}
              className="w-44"
            >
              <HeaderMenuAction
                icon={<Pencil size={13} />}
                label="重命名会话"
                onClick={() => {
                  const nextTitle = window.prompt('重命名会话', activeSession.title);
                  if (nextTitle?.trim()) renameSession(activeSession.id, nextTitle.trim());
                }}
              />
              <HeaderMenuAction
                icon={<Copy size={13} />}
                label="复制会话 ID"
                onClick={async () => {
                  await navigator.clipboard.writeText(activeSession.id);
                }}
              />
              <HeaderMenuAction
                icon={<Archive size={13} />}
                label="归档会话"
                onClick={() => {
                  archiveSession(activeSession.id);
                }}
              />
            </MenuContent>
            </MenuPortal>
          )}
        </MenuRoot>
      </div>
    </div>
  );
};

const HeaderMenuAction = ({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <MenuItem onSelect={onClick} icon={icon}>
    {label}
  </MenuItem>
);

const BreadcrumbLink = ({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) => (
  <>
    <button
      type="button"
      onClick={onClick}
      className="max-w-[180px] shrink-0 truncate rounded-[var(--theme-radius-control)] px-1.5 py-0.5 text-[13px] font-medium text-[var(--theme-text-muted)] transition-colors hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-secondary)]"
      title={title}
    >
      {title}
    </button>
    <ChevronRight size={12} className="shrink-0 text-[var(--theme-border-strong)]" />
  </>
);

function buildContentVersion(session?: Session) {
  if (!session) return 'none';

  const messageSignature = session.messages.map((message) => {
    const segmentSignature = (message.segments || []).map((segment) => {
      if (segment.type === 'text') return `text:${segment.content.length}`;
      if (segment.type === 'thinking') return `thinking:${segment.content.length}:${segment.isLive ? 1 : 0}`;
      if (segment.type === 'tool') {
        const logsLength = segment.tool.logs?.join('\n').length || 0;
        const resultLength = segment.tool.result?.length || 0;
        const argsLength = JSON.stringify(segment.tool.arguments || {}).length;
        return `tool:${segment.tool.id}:${segment.tool.status}:${segment.tool.subSessionId || 'none'}:${logsLength}:${resultLength}:${argsLength}`;
      }
      if (segment.type === 'retry') return `retry:${segment.state}:${segment.attempt}:${segment.retryInSeconds || 0}`;
      if (segment.type === 'ask') return `ask:${segment.status}:${segment.questions?.length || 0}`;
      if (segment.type === 'permission') return `permission:${segment.status}:${segment.request.toolId}`;
      return 'unknown';
    }).join('|');

    return [
      message.id,
      message.role,
      getMessageTextContent(message).length,
      message.status || 'none',
      message.startedAt || 0,
      message.endedAt || 0,
      segmentSignature,
    ].join('~');
  }).join('||');

  return [
    session.id,
    session.messages.length,
    session.updatedAt,
    session.runtime?.state || 'idle',
    session.runtime?.updatedAt || 0,
    session.error || '',
    messageSignature,
  ].join(':');
}

const collectSessionBreadcrumbs = (
  activeSession: Session | undefined,
  sessions: Map<string, Session>,
): Session[] => {
  if (!activeSession?.parentId) return [];

  const lineage: Session[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = activeSession.parentId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const session = sessions.get(currentId);
    if (!session) break;
    lineage.unshift(session);
    currentId = session.parentId;
  }

  return lineage;
};
