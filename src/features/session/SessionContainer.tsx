import { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, ChevronLeft, Archive, Pencil, Copy } from 'lucide-react';
import { ComposerBox } from '@/features/composer/ComposerBox';
import { UserMessage } from './components/UserMessage';
import { AgentMessage } from './components/AgentMessage';
import { SystemMessage } from './components/SystemMessage';
import { ContextUsagePanel } from './components/ContextUsagePanel';
import { PermissionDialog } from './components/PermissionDialog';
import { ErrorBanner } from './components/ErrorBanner';
import { MaxTurnsWarning } from './components/MaxTurnsWarning';
import { useSessionStore, useActiveSession } from '@/shared/state/useSessionStore';
import { usePermissionStore } from '@/shared/state/usePermissionStore';
import { useAutoScroll } from '@/shared/hooks/useAutoScroll';
import { EmptyState } from './EmptyState';
import type { Message } from '@/shared/types/schema';

export const SessionContainer = () => {
  const activeSession = useActiveSession();
  const sessions = useSessionStore((s) => s.sessions);
  const archiveSession = useSessionStore((s) => s.archiveSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const leftPanelMode = useSessionStore((s) => s.leftPanelMode);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(200);
  const composerRef = useRef<HTMLDivElement>(null);
  const { scrollRef } = useAutoScroll([
    activeSession?.id,
    activeSession?.messages.length,
    activeSession?.messages[activeSession.messages.length - 1]?.segments?.length,
  ]);

  const pendingPermissions = usePermissionStore((s) => s.pendingPermissions);
  const hasPendingPermission = pendingPermissions.size > 0;
  const firstPermission = hasPendingPermission ? Array.from(pendingPermissions.values())[0] : null;

  const messages = activeSession?.messages ?? [];
  const isSessionRunning = activeSession?.phase !== 'idle' && activeSession?.phase !== undefined && activeSession?.phase !== 'waiting_for_permission';

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        setComposerHeight(height);
      }
    });

    observer.observe(el);
    setComposerHeight(el.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, []);

  const isEmpty = !activeSession || messages.length === 0;
  const showChatShell = leftPanelMode === 'sessions';
  const parentSession = useMemo(
    () => (activeSession?.parentId ? sessions.get(activeSession.parentId) : null),
    [activeSession?.parentId, sessions],
  );

  return (
    <div className="relative flex flex-1 overflow-hidden bg-[linear-gradient(180deg,#f6f3ec_0%,#ffffff_24%,#ffffff_100%)]">
      <div className="relative flex flex-1 flex-col overflow-hidden">
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
        <EmptyState />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar flex flex-col smooth-scroll" style={{ paddingBottom: `${composerHeight + 32}px` }}>
          <div className="max-w-[760px] w-full mx-auto relative pointer-events-auto z-10 px-6">
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/70 bg-white/90 py-6 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[13px] text-slate-500">
                  {parentSession && (
                    <>
                      <button
                        onClick={() => useSessionStore.getState().navigateBack()}
                        className="flex items-center gap-1 hover:text-slate-800 transition-colors"
                      >
                        <ChevronLeft size={16} /> {parentSession.title}
                      </button>
                      <span>/</span>
                    </>
                  )}
                  <h2 className="text-[16px] font-medium text-gray-800">{activeSession?.title}</h2>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="relative flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0 group cursor-pointer text-gray-300 hover:text-gray-400 focus:outline-none"
                  title="上下文用量"
                  onClick={() => setIsContextPanelOpen(true)}
                >
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <path className="text-zinc-200" strokeWidth="6" stroke="currentColor" fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path className="text-zinc-400 group-hover:text-zinc-500 transition-colors" strokeWidth="6" strokeDasharray="6, 100" stroke="currentColor" fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                </button>
                <div className="relative">
                <button
                  onClick={() => setIsHeaderMenuOpen((v) => !v)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  <MoreHorizontal size={18} />
                </button>
                {isHeaderMenuOpen && activeSession && (
                  <div className="absolute right-0 top-8 z-30 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_30px_rgba(15,23,42,0.12)]">
                    <HeaderMenuAction
                      icon={<Pencil size={13} />}
                      label="重命名会话"
                      onClick={() => {
                        const nextTitle = window.prompt('重命名会话', activeSession.title);
                        if (nextTitle?.trim()) renameSession(activeSession.id, nextTitle.trim());
                        setIsHeaderMenuOpen(false);
                      }}
                    />
                    <HeaderMenuAction
                      icon={<Copy size={13} />}
                      label="复制会话 ID"
                      onClick={async () => {
                        await navigator.clipboard.writeText(activeSession.id);
                        setIsHeaderMenuOpen(false);
                      }}
                    />
                    <HeaderMenuAction
                      icon={<Archive size={13} />}
                      label="归档会话"
                      onClick={() => {
                        archiveSession(activeSession.id);
                        setIsHeaderMenuOpen(false);
                      }}
                    />
                  </div>
                )}
                </div>
              </div>
            </div>

            {activeSession?.error && (
              <div className="mb-4">
                <ErrorBanner message={activeSession.error} onDismiss={() => useSessionStore.getState().updateSession(activeSession.id, { error: null, maxTurnsReached: null })} />
              </div>
            )}

            {activeSession?.maxTurnsReached ? (
              <div className="mb-4">
                <MaxTurnsWarning
                  turns={activeSession.maxTurnsReached}
                />
              </div>
            ) : null}

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
                    isLast={index === messages.length - 1}
                    isSessionRunning={isSessionRunning}
                  />
                )
              ))}
            </div>
          </div>
        </div>
      )}

      {showChatShell && (
        <div ref={composerRef} className="absolute bottom-0 left-0 right-0 bg-transparent py-4 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none z-30">
          <ComposerBox />
        </div>
      )}

      {activeSession && (
        <ContextUsagePanel
          session={activeSession}
          isOpen={isContextPanelOpen}
          onClose={() => setIsContextPanelOpen(false)}
        />
      )}

      {hasPendingPermission && firstPermission && (
        <PermissionDialog
          request={firstPermission}
          onResolve={(toolId, approved) => {
            usePermissionStore.getState().resolvePending(toolId, approved);
          }}
        />
      )}
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
  <button
    onClick={onClick}
    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
  >
    {icon}
    <span>{label}</span>
  </button>
);
