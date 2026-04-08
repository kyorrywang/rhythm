import { useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Archive, Pencil, Copy } from 'lucide-react';
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

export const SessionContainer = () => {
  const activeSession = useActiveSession();
  const sessions = useSessionStore((s) => s.sessions);
  const archiveSession = useSessionStore((s) => s.archiveSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const { scrollRef } = useAutoScroll([
    activeSession?.id,
    activeSession?.messages.length,
    activeSession?.messages[activeSession.messages.length - 1]?.segments?.length,
  ]);

  const messages = activeSession?.messages ?? [];
  const isSessionRunning = activeSession?.phase !== 'idle' && activeSession?.phase !== undefined && activeSession?.phase !== 'waiting_for_permission';

  const isEmpty = !activeSession || messages.length === 0;
  const parentSession = useMemo(
    () => (activeSession?.parentId ? sessions.get(activeSession.parentId) ?? null : null),
    [activeSession?.parentId, sessions],
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
              parentSession={parentSession}
              onOpenContextPanel={() => setIsContextPanelOpen(true)}
              archiveSession={archiveSession}
              renameSession={renameSession}
            />
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar smooth-scroll">
            <div className="max-w-[820px] w-full mx-auto relative pointer-events-auto z-10 px-6">
            {activeSession?.error && (
              <div className="mb-4">
                <ErrorBanner message={activeSession.error} onDismiss={() => useSessionStore.getState().updateSession(activeSession.id, { error: null })} />
              </div>
            )}

            <div className="relative space-y-[calc(var(--theme-section-gap)*1.15)] pb-12 text-[length:var(--theme-body-size)] leading-relaxed text-[var(--theme-text-primary)]">
              {messages.map((msg: Message, index: number) => (
                msg.role === 'user' ? (
                  <UserMessage key={msg.id || index} message={msg} />
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
  parentSession,
  onOpenContextPanel,
  archiveSession,
  renameSession,
}: {
  activeSession?: Session;
  parentSession: Session | null;
  onOpenContextPanel: () => void;
  archiveSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[820px] items-center justify-between py-[var(--theme-section-gap)]">
      <div className="flex min-w-0 items-center gap-[var(--theme-toolbar-gap)]">
        <div className={`flex min-w-0 items-center gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-body-size)] ${themeRecipes.description()}`}>
          {parentSession && (
            <>
              <span className="shrink-0 truncate">{parentSession.title}</span>
              <span>/</span>
            </>
          )}
          <h2 className={`truncate ${themeRecipes.title()}`}>{activeSession?.title || '新会话'}</h2>
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
