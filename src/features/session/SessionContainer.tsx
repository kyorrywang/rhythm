import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Archive, Pencil, Copy } from 'lucide-react';
import { ComposerBox } from '@/features/composer/ComposerBox';
import { UserMessage } from './components/UserMessage';
import { AgentMessage } from './components/AgentMessage';
import { SystemMessage } from './components/SystemMessage';
import { ContextUsagePanel } from './components/ContextUsagePanel';
import { ErrorBanner } from './components/ErrorBanner';
import { useSessionStore, useActiveSession } from '@/shared/state/useSessionStore';
import { useAutoScroll } from '@/shared/hooks/useAutoScroll';
import { EmptyState } from './EmptyState';
import type { Message, Session } from '@/shared/types/schema';
import { Button } from '@/shared/ui/Button';

export const SessionContainer = () => {
  const activeSession = useActiveSession();
  const sessions = useSessionStore((s) => s.sessions);
  const archiveSession = useSessionStore((s) => s.archiveSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const leftPanelMode = useSessionStore((s) => s.leftPanelMode);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const { scrollRef } = useAutoScroll([
    activeSession?.id,
    activeSession?.messages.length,
    activeSession?.messages[activeSession.messages.length - 1]?.segments?.length,
  ]);

  const messages = activeSession?.messages ?? [];
  const isSessionRunning = activeSession?.phase !== 'idle' && activeSession?.phase !== undefined && activeSession?.phase !== 'waiting_for_permission';

  const isEmpty = !activeSession || messages.length === 0;
  const showChatShell = leftPanelMode === 'sessions';
  const parentSession = useMemo(
    () => (activeSession?.parentId ? sessions.get(activeSession.parentId) ?? null : null),
    [activeSession?.parentId, sessions],
  );

  return (
    <div className="relative flex min-w-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,#f6f3ec_0%,#ffffff_24%,#ffffff_100%)]">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {!showChatShell ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-[520px] rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-[0_30px_80px_rgba(15,23,42,0.06)]">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Main View</div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">当前处于 {leftPanelMode === 'plugins' ? '插件模式' : '设置模式'}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              左侧列表负责导航，Workbench 负责展示详情。后续阶段我们会把完整插件页和设置页接进来。
            </p>
          </div>
        </div>
      ) : isEmpty ? (
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

            <div className="space-y-6 text-[14px] leading-relaxed text-gray-800 pb-12 relative">
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

      {showChatShell && (
        <div className="shrink-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-4 pb-1 pointer-events-none z-30">
          <ComposerBox />
        </div>
      )}

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
}) => (
  <div className="mx-auto flex w-full max-w-[820px] items-center justify-between py-6">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex min-w-0 items-center gap-2 text-[13px] text-slate-500">
        {parentSession && (
          <>
            <span className="shrink-0 truncate text-slate-500">{parentSession.title}</span>
            <span>/</span>
          </>
        )}
        <h2 className="truncate text-[16px] font-semibold text-gray-900">{activeSession?.title || '新会话'}</h2>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <Button
        variant="unstyled"
        size="none"
        className="relative flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-300 hover:text-gray-400 focus:outline-none"
        title="上下文用量"
        onClick={onOpenContextPanel}
      >
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <path className="text-zinc-200" strokeWidth="6" stroke="currentColor" fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path className="text-zinc-400 transition-colors hover:text-zinc-500" strokeWidth="6" strokeDasharray="6, 100" stroke="currentColor" fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="unstyled"
            size="none"
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-slate-100 hover:text-gray-600 focus:outline-none data-[state=open]:bg-slate-100 data-[state=open]:text-gray-600"
          >
            <MoreHorizontal size={18} />
          </Button>
        </DropdownMenu.Trigger>
        {activeSession && (
          <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            collisionPadding={16}
            className="z-50 w-44 origin-[--radix-dropdown-menu-content-transform-origin] rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl outline-none data-[state=closed]:animate-[composer-popover-out_120ms_ease-in_forwards] data-[state=open]:animate-[composer-popover-in_180ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
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
          </DropdownMenu.Content>
          </DropdownMenu.Portal>
        )}
      </DropdownMenu.Root>
    </div>
  </div>
);

const HeaderMenuAction = ({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <DropdownMenu.Item
    onSelect={onClick}
    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-slate-600 outline-none transition-colors hover:bg-slate-50 hover:text-slate-900 focus:bg-slate-50 focus:text-slate-900"
  >
    {icon}
    <span>{label}</span>
  </DropdownMenu.Item>
);
